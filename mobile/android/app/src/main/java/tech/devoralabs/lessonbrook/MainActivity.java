package tech.devoralabs.lessonbrook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private enum Screen { WELCOME, TODAY, PAGE }

    private static final String SESSION = "chotcong_session";
    private static final String LOCALE = "chotcong_locale";
    private static final String DELETION = "/account/deletion";
    private static final String DRAFT_STATE = """
        ({
            state: document.querySelector('[data-mobile-draft="saving"]') ? 'saving' :
                document.querySelector('[data-mobile-draft="dirty"]') ? 'dirty' : 'clean',
            theme: document.querySelector('[data-saved-theme]')?.dataset.savedTheme ?? ''
        })
        """;
    private static final String SHARE_DATA = """
        (() => {
            const link = document.querySelector('[data-statement-share-url]');
            return link ? { url: link.dataset.statementShareUrl, text: link.dataset.statementShareMessage } : null;
        })()
        """;

    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private LinearLayout root;
    private LinearLayout toolbar;
    private LinearLayout tabs;
    private FrameLayout content;
    private WebView webView;
    private ProgressBar progress;
    private AlertDialog signInError;
    private Screen screen = Screen.WELCOME;
    private NativeWorkspace.Tab tab = NativeWorkspace.Tab.DASHBOARD;
    private NativeWorkspace.Snapshot snapshot;
    private String webTheme;
    private String locale = "en";
    private String webRoot;
    private String verifier;
    private int requestVersion;
    private boolean signingIn;
    private boolean signedIn;
    private boolean scheduleInitialized;
    private boolean webFailed;
    private View webError;
    private boolean checkingDraft;
    private AlertDialog draftAlert;
    private final Runnable dashboardTick = new Runnable() {
        @Override
        public void run() {
            if (screen == Screen.TODAY && snapshot != null) loadDashboard(++requestVersion, true);
            root.postDelayed(this, 60_000);
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildView();
        String saved = originCookies();
        updateLocale(saved);
        if (!cookie(saved, SESSION).isEmpty()) showToday();
        else if (!cookie(saved, "chotcong_deletion").isEmpty()) openPage(DELETION);
        else showWelcome(false);
        finishSignIn(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        finishSignIn(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (screen == Screen.TODAY && snapshot != null) loadDashboard(++requestVersion, true);
        root.postDelayed(dashboardTick, 60_000);
    }

    @Override
    protected void onPause() {
        root.removeCallbacks(dashboardTick);
        super.onPause();
    }

    private void buildView() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                var safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard));
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(58)));
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        tabs = new LinearLayout(this);
        root.addView(tabs, new LinearLayout.LayoutParams(-1, -2));
    }

    private NativeWorkspace.Palette palette() {
        String theme = webTheme != null ? webTheme : snapshot == null ? "playful-retro" : snapshot.theme();
        return NativeWorkspace.Palette.from(theme);
    }

    private NativeWorkspace workspace() {
        return new NativeWorkspace(this, locale, palette());
    }

    @SuppressWarnings("deprecation")
    private void chrome() {
        NativeWorkspace ui = workspace();
        NativeWorkspace.Palette colors = palette();
        root.setBackgroundColor(colors.background());
        int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        if (Build.VERSION.SDK_INT >= 35) {
            getWindow().getInsetsController().setSystemBarsAppearance(colors.dark() ? 0 : lightBars, lightBars);
        } else {
            getWindow().setStatusBarColor(colors.background());
            getWindow().setNavigationBarColor(colors.background());
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(colors.dark() ? 0 : light);
        }

        toolbar.removeAllViews();
        toolbar.setVisibility(screen == Screen.WELCOME ? View.GONE : View.VISIBLE);
        toolbar.setBackgroundColor(colors.surface());
        if (screen == Screen.PAGE) toolbar.addView(tool(R.drawable.ic_back, R.string.back, this::goBack));

        TextView title = new TextView(this);
        title.setText(ui.text(screen == Screen.PAGE ? pageTitle(webPath()) : tab.title));
        title.setTextColor(colors.foreground());
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextSize(20);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        if (Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        title.setPadding(dp(screen == Screen.PAGE ? 2 : 20), 0, dp(8), 0);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        if (screen == Screen.TODAY) toolbar.addView(tool(R.drawable.ic_refresh, R.string.reload, this::showToday));
        if (screen != Screen.WELCOME && !DELETION.equals(webRoot)) {
            String path = screen == Screen.PAGE ? webPath() : "/app";
            if (!"/app/appearance".equals(path))
                toolbar.addView(tool(R.drawable.ic_palette, R.string.choose_theme, () -> openToolbarPage("/app/appearance")));
            if (!"/app/settings".equals(path))
                toolbar.addView(tool(R.drawable.ic_settings, R.string.account_settings, () -> openToolbarPage("/app/settings")));
        }

        tabs.removeAllViews();
        boolean showTabs = screen != Screen.WELCOME && !DELETION.equals(webRoot);
        tabs.setVisibility(showTabs ? View.VISIBLE : View.GONE);
        if (showTabs) tabs.addView(ui.tabs(tab, this::selectTab), new LinearLayout.LayoutParams(-1, -2));
    }

    private ImageButton tool(int icon, int label, Runnable action) {
        ImageButton button = new ImageButton(this);
        TypedValue background = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, background, true);
        button.setBackgroundResource(background.resourceId);
        button.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48)));
        button.setImageResource(icon);
        button.setImageTintList(ColorStateList.valueOf(palette().foreground()));
        button.setContentDescription(workspace().text(label));
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private void selectTab(NativeWorkspace.Tab target) {
        beforeLeavingPage(() -> openTab(target));
    }

    private void openTab(NativeWorkspace.Tab target) {
        if (target.path != null) openPage(target.path);
        else showToday();
    }

    private void openToolbarPage(String path) {
        beforeLeavingPage(() -> {
            String current = webView == null ? null : webView.getUrl();
            if (current != null && MobileSignIn.isFirstParty(Uri.parse(current))) {
                if (!path.equals(Uri.parse(current).getPath())) webView.loadUrl(MobileSignIn.ORIGIN + path);
            } else openPage(path);
        });
    }

    private void nativeView(View child) {
        closePage();
        content.removeAllViews();
        content.addView(child, new FrameLayout.LayoutParams(-1, -1));
        chrome();
    }

    private void showWelcome(boolean expired) {
        int version = ++requestVersion;
        signedIn = false;
        scheduleInitialized = false;
        snapshot = null;
        webTheme = null;
        screen = Screen.WELCOME;
        tab = NativeWorkspace.Tab.DASHBOARD;
        renderWelcome(null, expired, false);
        network.execute(() -> {
            try {
                boolean available = MobileSignIn.get("/api/auth/availability", "").getBoolean("available");
                deliver(version, () -> renderWelcome(available, expired, false));
            } catch (IOException | JSONException error) {
                deliver(version, () -> renderWelcome(null, expired, true));
            }
        });
    }

    private void renderWelcome(Boolean available, boolean expired, boolean failed) {
        nativeView(workspace().welcome(
            available, expired, failed, this::startSignIn, () -> showWelcome(expired),
            () -> chooseLanguage(expired), () -> openBrowser(Uri.parse(MobileSignIn.ORIGIN + "/help"))
        ));
    }

    private void chooseLanguage(boolean expired) {
        new AlertDialog.Builder(this)
            .setSingleChoiceItems(new String[] {"English", "Tiếng Việt"}, "vi".equals(locale) ? 1 : 0,
                (dialog, choice) -> {
                    dialog.dismiss();
                    String language = choice == 1 ? "vi" : "en";
                    if (language.equals(locale)) return;
                    CookieManager.getInstance().setCookie(MobileSignIn.ORIGIN,
                        LOCALE + "=" + language + "; Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=Lax",
                        saved -> {
                            if (!saved || isDestroyed() || screen != Screen.WELCOME) return;
                            locale = language;
                            network.execute(() -> CookieManager.getInstance().flush());
                            showWelcome(expired);
                        });
                })
            .show();
    }

    private void showToday() {
        int version = ++requestVersion;
        signedIn = true;
        screen = Screen.TODAY;
        tab = NativeWorkspace.Tab.DASHBOARD;
        if (snapshot != null) renderToday();
        else {
            nativeView(new FrameLayout(this));
            ProgressBar loading = workspace().loading();
            content.addView(loading, new FrameLayout.LayoutParams(dp(40), dp(40), Gravity.CENTER));
        }
        loadDashboard(version, false);
    }

    private void loadDashboard(int version, boolean quiet) {
        String saved = originCookies();
        String credentials = cookie(saved, SESSION);
        String language = cookie(saved, LOCALE);
        if (!credentials.isEmpty() && !language.isEmpty()) credentials += "; " + language;
        String headers = credentials;
        boolean initialize = !scheduleInitialized;
        network.execute(() -> {
            try {
                var result = NativeWorkspace.Snapshot.parse(MobileSignIn.workspace(headers, initialize));
                deliver(version, () -> {
                    scheduleInitialized = true;
                    snapshot = result;
                    webTheme = null;
                    locale = result.locale();
                    renderToday();
                });
            } catch (MobileSignIn.HttpFailure error) {
                deliver(version, () -> {
                    if (error.status == 401) expireSession();
                    else if (error.status == 423) openPage(DELETION);
                    else if (!quiet) showDashboardError();
                });
            } catch (IOException | JSONException error) {
                if (!quiet) deliver(version, this::showDashboardError);
            }
        });
    }

    private void renderToday() { nativeView(workspace().today(snapshot, this::openPage)); }

    private void showDashboardError() { nativeView(workspace().error(this::showToday)); }

    private void deliver(int version, Runnable display) {
        runOnUiThread(() -> {
            if (!isDestroyed() && requestVersion == version) display.run();
        });
    }

    private void openPage(String path) {
        ++requestVersion;
        closePage();
        content.removeAllViews();
        screen = Screen.PAGE;
        webRoot = path;
        tab = pageTab(path, tab);
        WebView web = new WebView(this);
        webView = web;
        configureWebView(web);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        chrome();
        web.loadUrl(MobileSignIn.ORIGIN + path);
    }

    private void closePage() {
        if (webView != null) {
            WebView previous = webView;
            webView = null;
            previous.stopLoading();
            content.removeView(previous);
            previous.destroy();
        }
        webRoot = null;
        webFailed = false;
        if (webError != null) {
            content.removeView(webError);
            webError = null;
        }
    }

    private void configureWebView(WebView web) {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " LessonBrookApp/Android NativeWorkspace/1 MobileActions/1 NativeChrome/1");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (MobileSignIn.isFirstParty(url)) return false;
                String current = view.getUrl();
                if (view == webView && request.isForMainFrame() && request.hasGesture() && !request.isRedirect()
                    && current != null && MobileSignIn.isFirstParty(Uri.parse(current))) {
                    if ((MobileSignIn.SCHEME + "://share-statement").equals(url.toString())) {
                        String path = Uri.parse(current).getPath();
                        if (path != null && path.startsWith("/app/statements/")) shareStatement(view, current);
                    } else if ((MobileSignIn.SCHEME + "://data").equals(url.toString())) {
                        openBrowser(Uri.parse(MobileSignIn.ORIGIN + "/login?next=data"));
                    } else if ("https".equals(url.getScheme()) || "http".equals(url.getScheme())
                        || "mailto".equals(url.getScheme())) {
                        openBrowser(url);
                    }
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (view != webView) return;
                webFailed = false;
                view.setVisibility(View.VISIBLE);
                if (webError != null) {
                    content.removeView(webError);
                    webError = null;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (view != webView || webFailed) return;
                updateLocale(originCookies());
                track(view, url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                track(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError(view);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) showLoadError(view);
            }
        });
    }

    private void shareStatement(WebView view, String source) {
        view.evaluateJavascript(SHARE_DATA, value -> {
            if (isDestroyed() || view != webView || !source.equals(view.getUrl()) || value == null) return;
            try {
                JSONObject data = new JSONObject(value == null ? "{}" : value);
                String address = data.getString("url");
                String text = data.getString("text");
                Uri link = Uri.parse(address);
                String token = link.getFragment();
                if (!MobileSignIn.isFirstParty(link) || !"/s".equals(link.getPath()) || link.getQuery() != null
                    || token == null || !token.matches("[A-Za-z0-9_-]{43}") || text.length() > 4096
                    || !text.endsWith(address)) return;
                Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(share, workspace().text(R.string.share_statement)));
            } catch (JSONException | ActivityNotFoundException error) {
                Toast.makeText(this, workspace().text(R.string.share_unavailable), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void track(WebView view, String url) {
        if (view != webView || url == null) return;
        Uri uri = Uri.parse(url);
        if (!MobileSignIn.isFirstParty(uri)) return;
        String path = uri.getPath();
        if (path == null) return;
        switch (path) {
            case "/app" -> showToday();
            case "/" -> { if (signedIn) showToday(); else showWelcome(false); }
            case "/login" -> { if (uri.getQueryParameter("expired") == null) showWelcome(false); else expireSession(); }
            case DELETION -> {
                webRoot = DELETION;
                chrome();
            }
            default -> {
                tab = pageTab(path, tab);
                chrome();
            }
        }
    }

    private void showLoadError(WebView view) {
        if (view != webView || webFailed) return;
        webFailed = true;
        view.setVisibility(View.INVISIBLE);
        webError = workspace().error(() -> {
            if (view.getUrl() == null) view.loadUrl(MobileSignIn.ORIGIN + webRoot);
            else view.reload();
        });
        content.addView(webError, new FrameLayout.LayoutParams(-1, -1));
    }

    private void startSignIn() {
        if (signingIn) return;
        verifier = MobileSignIn.newVerifier();
        if (!openBrowser(MobileSignIn.browserUrl(verifier))) verifier = null;
    }

    private boolean openBrowser(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
            return true;
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, workspace().text(R.string.browser_error), Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private void finishSignIn(Intent intent) {
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || signingIn) return;
        String code = MobileSignIn.callbackCode(intent.getData());
        if (code == null) return;
        if (verifier == null) {
            showSignInError();
            return;
        }
        ++requestVersion;
        String proof = verifier;
        verifier = null;
        signingIn = true;
        progress = workspace().loading();
        content.addView(progress, new FrameLayout.LayoutParams(dp(42), dp(42), Gravity.CENTER));
        CookieManager cookies = CookieManager.getInstance();
        String theme = cookie(originCookies(), MobileSignIn.GUEST_THEME);
        String guest = theme.matches(MobileSignIn.GUEST_THEME + "=[a-z-]{1,32}") ? theme : null;
        network.execute(() -> {
            try {
                String session = MobileSignIn.exchange(code, proof, guest);
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cookies.setCookie(MobileSignIn.ORIGIN, session, saved -> {
                        if (saved && guest != null) {
                            cookies.setCookie(MobileSignIn.ORIGIN, expiredCookie(MobileSignIn.GUEST_THEME),
                                removed -> completeSignIn(true));
                        } else {
                            completeSignIn(saved);
                        }
                    });
                });
            } catch (IOException | JSONException error) {
                runOnUiThread(() -> completeSignIn(false));
            }
        });
    }

    private void completeSignIn(boolean saved) {
        if (isDestroyed()) return;
        signingIn = false;
        content.removeView(progress);
        progress = null;
        if (saved) {
            network.execute(() -> CookieManager.getInstance().flush());
            showToday();
        } else {
            showWelcome(false);
            showSignInError();
        }
    }

    private void expireSession() {
        CookieManager.getInstance().setCookie(MobileSignIn.ORIGIN, expiredCookie(SESSION));
        showWelcome(true);
    }

    private static String expiredCookie(String name) { return name + "=; Max-Age=0; Path=/; Secure"; }

    private void showSignInError() {
        if (signInError != null && signInError.isShowing()) return;
        signInError = new AlertDialog.Builder(this)
            .setTitle(workspace().text(R.string.sign_in_error))
            .setMessage(workspace().text(R.string.sign_in_retry))
            .setPositiveButton(android.R.string.ok, null)
            .show();
    }

    private String originCookies() { return CookieManager.getInstance().getCookie(MobileSignIn.ORIGIN); }

    private static String cookie(String headers, String name) {
        if (headers != null) {
            for (String item : headers.split(";")) {
                String candidate = item.trim();
                if (candidate.startsWith(name + "=") && candidate.length() > name.length() + 1) return candidate;
            }
        }
        return "";
    }

    private void updateLocale(String saved) { locale = cookie(saved, LOCALE).equals(LOCALE + "=vi") ? "vi" : "en"; }

    private String webPath() {
        String url = webView == null ? null : webView.getUrl();
        String path = url == null ? null : Uri.parse(url).getPath();
        return path == null ? webRoot : path;
    }

    private static NativeWorkspace.Tab pageTab(String path, NativeWorkspace.Tab fallback) {
        if (path.startsWith("/app/students")) return NativeWorkspace.Tab.STUDENTS;
        if (path.startsWith("/app/sessions") || path.startsWith("/app/lessons") || path.equals("/app/schedule"))
            return NativeWorkspace.Tab.LESSONS;
        if (path.startsWith("/app/statements")) return NativeWorkspace.Tab.STATEMENTS;
        if (path.startsWith("/app/classes")) return NativeWorkspace.Tab.CLASSES;
        return fallback;
    }

    private int pageTitle(String path) {
        return switch (path) {
            case "/app/lessons/new" -> R.string.record_lesson;
            case "/app/schedule" -> R.string.upcoming_lessons;
            case "/app/classes" -> R.string.classes;
            case "/app/settings" -> R.string.account_settings;
            case "/app/appearance" -> R.string.appearance;
            case DELETION -> R.string.account_deletion;
            case "/onboarding" -> R.string.get_started;
            case "/help" -> R.string.help_support;
            default -> pageTab(path, tab).title;
        };
    }

    private boolean goBack() {
        if (screen == Screen.PAGE) {
            beforeLeavingPage(() -> {
                if (webView != null && webView.canGoBack()) webView.goBack();
                else if (DELETION.equals(webRoot)) showWelcome(false);
                else showToday();
            });
            return true;
        }
        return false;
    }

    private void beforeLeavingPage(Runnable leave) {
        if (checkingDraft || (draftAlert != null && draftAlert.isShowing())) return;
        WebView web = webView;
        String location = web == null ? null : web.getUrl();
        Uri url = location == null ? null : Uri.parse(location);
        String path = url == null ? null : url.getPath();
        if (path == null || !MobileSignIn.isFirstParty(url)
            || !(path.startsWith("/app/") || path.equals("/onboarding"))) {
            leave.run();
            return;
        }
        checkingDraft = true;
        web.evaluateJavascript(DRAFT_STATE, value -> {
            checkingDraft = false;
            if (isDestroyed() || web != webView || !location.equals(web.getUrl())) return;
            String state = "";
            try {
                JSONObject result = new JSONObject(value == null ? "{}" : value);
                state = result.optString("state");
                String theme = result.optString("theme");
                if (!theme.isEmpty()) webTheme = theme;
            } catch (JSONException ignored) {
                // An interrupted page still needs the draft confirmation.
            }
            if ("clean".equals(state)) {
                leave.run();
                return;
            }
            boolean saving = "saving".equals(state);
            NativeWorkspace ui = workspace();
            AlertDialog.Builder dialog = new AlertDialog.Builder(this)
                .setTitle(ui.text(saving ? R.string.saving_changes : R.string.unsaved_changes))
                .setMessage(ui.text(saving ? R.string.wait_for_save : R.string.discard_message))
                .setNegativeButton(ui.text(saving ? android.R.string.ok : R.string.keep_editing), null);
            if (!saving) dialog.setPositiveButton(ui.text(R.string.discard_changes), (ignored, choice) -> {
                if (web == webView && location.equals(web.getUrl())) leave.run();
            });
            draftAlert = dialog.show();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!goBack()) super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        ++requestVersion;
        network.shutdown();
        closePage();
        super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
