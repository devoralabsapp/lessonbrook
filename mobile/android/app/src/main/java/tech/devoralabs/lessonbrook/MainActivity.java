package tech.devoralabs.lessonbrook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;

public final class MainActivity extends Activity {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private WebView webView;
    private View errorPanel;
    private ProgressBar progress;
    private Button back;
    private AlertDialog signInError;
    private String verifier;
    private boolean signingIn;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildView();
        configureWebView();
        String cookies = CookieManager.getInstance().getCookie(MobileSignIn.ORIGIN);
        boolean signedIn = cookies != null && cookies.matches("(^|.*; )chotcong_session=[^;]+(;.*|$)");
        webView.loadUrl(signedIn ? MobileSignIn.ORIGIN + "/app" : MobileSignIn.ORIGIN);
        finishSignIn(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        finishSignIn(intent);
    }

    private void buildView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                var safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard));
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(lightBars, lightBars);
        }

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), 0, dp(8), 0);
        back = new Button(this);
        back.setText(R.string.back);
        back.setEnabled(false);
        back.setOnClickListener(view -> goBack());
        toolbar.addView(back);

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(17);
        title.setGravity(Gravity.CENTER);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));

        Button refresh = new Button(this);
        refresh.setText(R.string.reload);
        refresh.setOnClickListener(view -> reload());
        toolbar.addView(refresh);
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(56)));

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        webView = new WebView(this);
        content.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout fallback = new LinearLayout(this);
        fallback.setOrientation(LinearLayout.VERTICAL);
        fallback.setGravity(Gravity.CENTER);
        fallback.setPadding(dp(24), dp(24), dp(24), dp(24));
        TextView message = new TextView(this);
        message.setText(R.string.load_error);
        message.setGravity(Gravity.CENTER);
        message.setTextSize(16);
        fallback.addView(message);
        Button retry = new Button(this);
        retry.setText(R.string.try_again);
        retry.setOnClickListener(view -> reload());
        fallback.addView(retry);
        errorPanel = fallback;
        errorPanel.setVisibility(View.GONE);
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        content.addView(progress, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER));
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " LessonBrookApp/Android");
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (MobileSignIn.isFirstParty(url)) return false;
                String current = view.getUrl();
                if (request.isForMainFrame() && request.hasGesture() && !request.isRedirect()
                    && current != null && MobileSignIn.isFirstParty(Uri.parse(current))) {
                    if ((MobileSignIn.SCHEME + "://start").equals(url.toString())) {
                        startSignIn();
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
                webView.setVisibility(View.VISIBLE);
                errorPanel.setVisibility(View.GONE);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                back.setEnabled(view.canGoBack());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) showLoadError();
            }
        });
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
            Toast.makeText(this, R.string.browser_error, Toast.LENGTH_LONG).show();
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
        String proof = verifier;
        verifier = null;
        signingIn = true;
        progress.setVisibility(View.VISIBLE);
        CookieManager cookies = CookieManager.getInstance();
        String guestTheme = guestTheme(cookies.getCookie(MobileSignIn.ORIGIN));
        network.execute(() -> {
            try {
                String session = MobileSignIn.exchange(code, proof, guestTheme);
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cookies.setCookie(MobileSignIn.ORIGIN, session, saved -> {
                        if (!saved) {
                            completeSignIn(false);
                        } else if (guestTheme == null) {
                            completeSignIn(true);
                        } else {
                            cookies.setCookie(MobileSignIn.ORIGIN,
                                MobileSignIn.GUEST_THEME + "=; Max-Age=0; Path=/; Secure",
                                removed -> completeSignIn(true));
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
        progress.setVisibility(View.GONE);
        if (!saved) {
            showSignInError();
            return;
        }
        network.execute(() -> CookieManager.getInstance().flush());
        webView.loadUrl(MobileSignIn.ORIGIN + "/app");
    }

    private static String guestTheme(String cookieHeader) {
        if (cookieHeader == null) return null;
        for (String cookie : cookieHeader.split(";")) {
            String candidate = cookie.trim();
            if (candidate.matches(MobileSignIn.GUEST_THEME + "=[a-z-]{1,32}")) return candidate;
        }
        return null;
    }

    private void showSignInError() {
        if (signInError != null && signInError.isShowing()) return;
        signInError = new AlertDialog.Builder(this)
            .setTitle(R.string.sign_in_error)
            .setMessage(R.string.sign_in_retry)
            .setPositiveButton(android.R.string.ok, null)
            .show();
    }

    private void showLoadError() {
        webView.setVisibility(View.INVISIBLE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void reload() {
        if (webView.getUrl() == null) webView.loadUrl(MobileSignIn.ORIGIN);
        else webView.reload();
    }

    private boolean goBack() {
        if (!webView.canGoBack()) return false;
        webView.goBack();
        return true;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!goBack()) super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        network.shutdown();
        webView.destroy();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
