package tech.devoralabs.lessonbrook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private enum Screen { WELCOME, PAGE }

    private static final String SESSION = "chotcong_session";
    private static final String LOCALE = "chotcong_locale";
    private static final String DELETION = "/account/deletion";
    private static final String DRAFT_STATE = """
        ({
            state: document.querySelector('[data-mobile-draft="saving"]') ? 'saving' :
                document.querySelector('[data-mobile-draft="dirty"]') ? 'dirty' : 'clean'
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
    private LinearLayout tabs;
    private FrameLayout content;
    private WebView webView;
    private ProgressBar progress;
    private AlertDialog signInError;
    private Screen screen = Screen.WELCOME;
    private NativeWorkspace.Tab tab = NativeWorkspace.Tab.DASHBOARD;
    private WebMessagePort chromePort;
    private String webTheme;
    private String locale = "en";
    private String webRoot;
    private String verifier;
    private int requestVersion;
    private boolean signingIn;
    private boolean signedIn;
    private boolean demoMode;
    private boolean webFailed;
    private View webError;
    private boolean checkingDraft;
    private AlertDialog draftAlert;
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildView();
        String saved = originCookies();
        updateLocale(saved);
        if (!cookie(saved, SESSION).isEmpty()) showWorkspace();
        else if (!cookie(saved, "chotcong_deletion").isEmpty()) openPage(DELETION);
        else showWelcome(false);
        finishSignIn(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        finishSignIn(intent);
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
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        tabs = new LinearLayout(this);
        root.addView(tabs, new LinearLayout.LayoutParams(-1, -2));
    }

    private NativeWorkspace.Palette palette() {
        String theme = webTheme == null ? "playful-retro" : webTheme;
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

        tabs.removeAllViews();
        boolean showTabs = screen != Screen.WELCOME && !DELETION.equals(webRoot);
        tabs.setVisibility(showTabs ? View.VISIBLE : View.GONE);
        if (showTabs) tabs.addView(ui.tabs(tab, this::selectTab), new LinearLayout.LayoutParams(-1, -2));
    }

    private void selectTab(NativeWorkspace.Tab target) {
        beforeLeavingPage(() -> switchWebTab(target));
    }

    private void switchWebTab(NativeWorkspace.Tab target) {
        String path = target.path == null ? "/app" : target.path;
        WebView web = webView;
        String source = web == null ? null : web.getUrl();
        Uri uri = source == null ? null : Uri.parse(source);
        if (webFailed || uri == null || !MobileSignIn.isFirstParty(uri)
            || uri.getPath() == null || !(uri.getPath().equals(demoMode ? "/demo" : "/app") || uri.getPath().startsWith(demoMode ? "/demo/" : "/app/"))) {
            openPage(path);
            return;
        }
        String script = "!window.dispatchEvent(new CustomEvent('lessonbrook:navigate-tab', {cancelable: true, detail: "
            + JSONObject.quote(path) + "}))";
        web.evaluateJavascript(script, accepted -> {
            if (web != webView || isDestroyed()) return;
            if ("true".equals(accepted)) {
                webRoot = destination(path);
                tab = target;
                chrome();
            } else if (source.equals(web.getUrl())) {
                openPage(path);
            }
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
        demoMode = false;
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
            available, expired, failed, this::startSignIn, this::showDemo, () -> showWelcome(expired),
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

    private void showDemo() {
        demoMode = true;
        webTheme = null;
        tab = NativeWorkspace.Tab.DASHBOARD;
        openPage("/app");
    }

    private String destination(String path) {
        if (!demoMode) return path;
        if ("/app".equals(path)) return "/demo";
        if (path.startsWith("/app/")) return "/demo/" + path.substring(5);
        if ("/onboarding".equals(path)) return "/demo/onboarding";
        return path;
    }

    private static String workspacePath(String path) {
        if ("/demo".equals(path)) return "/app";
        if (path != null && path.startsWith("/demo/")) return "/app/" + path.substring(6);
        return path;
    }

    private void showWorkspace() {
        demoMode = false;
        signedIn = true;
        tab = NativeWorkspace.Tab.DASHBOARD;
        openPage("/app");
    }

    private void deliver(int version, Runnable display) {
        runOnUiThread(() -> {
            if (!isDestroyed() && requestVersion == version) display.run();
        });
    }

    private void openPage(String target) {
        String path = destination(target);
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
        closeChromeChannel();
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
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " LessonBrookApp/Android NativeWorkspace/1 MobileActions/1 NativeChrome/1 WorkspaceHeader/1");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebChromeClient(new WebChromeClient());
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
                closeChromeChannel();
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
                connectChrome(view, url);
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

    private void connectChrome(WebView view, String url) {
        if (view != webView || !url.equals(view.getUrl()) || !MobileSignIn.isFirstParty(Uri.parse(url))) return;
        closeChromeChannel();
        view.evaluateJavascript("""
            (() => {
                const root = document.querySelector('[data-workspace]');
                if (!root) return false;
                window.addEventListener('message', event => {
                    if (event.data !== 'lessonbrook:appearance' || !event.ports.length) return;
                    const port = event.ports[0];
                    const send = () => port.postMessage(root.dataset.theme || '');
                    new MutationObserver(send).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
                    send();
                }, { once: true });
                return true;
            })()
            """, ready -> {
                if (!"true".equals(ready) || view != webView || !url.equals(view.getUrl())) return;
                WebMessagePort[] ports = view.createWebMessageChannel();
                chromePort = ports[0];
                chromePort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                    @Override
                    public void onMessage(WebMessagePort port, WebMessage message) {
                        if (port != chromePort || view != webView) return;
                        String theme = message.getData();
                        if (theme == null) return;
                        String applied = NativeWorkspace.Palette.from(theme).theme();
                        if (!applied.equals(webTheme)) {
                            webTheme = applied;
                            chrome();
                        }
                    }
                });
                view.postWebMessage(new WebMessage("lessonbrook:appearance", new WebMessagePort[]{ports[1]}),
                    Uri.parse(MobileSignIn.ORIGIN));
            });
    }

    private void closeChromeChannel() {
        if (chromePort != null) {
            chromePort.close();
            chromePort = null;
        }
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
            case "/demo" -> {
                demoMode = true;
                tab = NativeWorkspace.Tab.DASHBOARD;
                chrome();
            }
            case "/app" -> {
                signedIn = true;
                tab = NativeWorkspace.Tab.DASHBOARD;
                chrome();
            }
            case "/" -> { if (signedIn) showWorkspace(); else showWelcome(false); }
            case "/login" -> {
                boolean startFromDemo = demoMode && "1".equals(uri.getQueryParameter("mobileSignIn"));
                if (uri.getQueryParameter("expired") == null) showWelcome(false);
                else expireSession();
                if (startFromDemo) startSignIn();
            }
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
            showWorkspace();
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
        path = workspacePath(path);
        if (path == null) return fallback;
        if (path.startsWith("/app/students")) return NativeWorkspace.Tab.STUDENTS;
        if (path.startsWith("/app/sessions") || path.startsWith("/app/lessons") || path.equals("/app/schedule"))
            return NativeWorkspace.Tab.LESSONS;
        if (path.startsWith("/app/statements")) return NativeWorkspace.Tab.STATEMENTS;
        if (path.startsWith("/app/classes")) return NativeWorkspace.Tab.CLASSES;
        return fallback;
    }

    private boolean goBack() {
        if (screen == Screen.PAGE && signedIn && "/app".equals(webPath())) return false;
        if (screen == Screen.PAGE) {
            beforeLeavingPage(() -> {
                if (DELETION.equals(webRoot)) showWelcome(false);
                else if (canReturnWithinTab()) webView.goBack();
                else {
                    String path = tab.path == null ? "/app" : tab.path;
                    if (!path.equals(workspacePath(webPath()))) switchWebTab(tab);
                    else if (tab != NativeWorkspace.Tab.DASHBOARD) switchWebTab(NativeWorkspace.Tab.DASHBOARD);
                    else showWelcome(false);
                }
            });
            return true;
        }
        return false;
    }

    private boolean canReturnWithinTab() {
        if (webView == null || !webView.canGoBack()) return false;
        String current = workspacePath(webPath());
        if (current == null || current.equals(tab.path == null ? "/app" : tab.path)) return false;
        var history = webView.copyBackForwardList();
        var previous = history.getItemAtIndex(history.getCurrentIndex() - 1);
        if (previous == null) return false;
        Uri url = Uri.parse(previous.getUrl());
        String path = url.getPath();
        return MobileSignIn.isFirstParty(url) && path != null
            && (demoMode ? path.startsWith("/demo/") : path.startsWith("/app/"))
            && pageTab(path, null) == tab;
    }

    private void beforeLeavingPage(Runnable leave) {
        if (checkingDraft || (draftAlert != null && draftAlert.isShowing())) return;
        WebView web = webView;
        String location = web == null ? null : web.getUrl();
        Uri url = location == null ? null : Uri.parse(location);
        String path = url == null ? null : url.getPath();
        if (path == null || !MobileSignIn.isFirstParty(url)
            || !(path.startsWith("/app/") || path.startsWith("/demo") || path.equals("/onboarding"))) {
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
