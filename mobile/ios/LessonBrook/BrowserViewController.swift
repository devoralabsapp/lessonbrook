import UIKit
import WebKit

final class BrowserViewController: UIViewController, WKNavigationDelegate {
    private let webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = NativeGoogleSignIn.isConfigured
            ? "LessonBrookApp/iOS NativeGoogleSignIn/1" : "LessonBrookApp/iOS"
        return WKWebView(frame: .zero, configuration: config)
    }()
    private let errorPanel = UIStackView()
    private let activity = UIActivityIndicatorView(style: .medium)
    private var verifier: String?
    private var signingIn = false

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "LessonBrook"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(goBack)
        )
        navigationItem.leftBarButtonItem?.accessibilityLabel = NSLocalizedString("Back", comment: "")
        navigationItem.leftBarButtonItem?.isEnabled = false
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "arrow.clockwise"), style: .plain, target: self, action: #selector(reload)
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel = NSLocalizedString("Reload", comment: "")
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        let message = UILabel()
        message.text = NSLocalizedString("LessonBrook couldn’t load. Check your connection and try again.", comment: "")
        message.font = .preferredFont(forTextStyle: .body)
        message.adjustsFontForContentSizeCategory = true
        message.textAlignment = .center
        message.numberOfLines = 0
        let retry = UIButton(type: .system)
        retry.setTitle(NSLocalizedString("Try again", comment: ""), for: .normal)
        retry.addTarget(self, action: #selector(reload), for: .touchUpInside)
        errorPanel.axis = .vertical
        errorPanel.alignment = .center
        errorPanel.spacing = 16
        errorPanel.addArrangedSubview(message)
        errorPanel.addArrangedSubview(retry)
        errorPanel.translatesAutoresizingMaskIntoConstraints = false
        errorPanel.isHidden = true
        view.addSubview(errorPanel)

        activity.hidesWhenStopped = true
        activity.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activity)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            errorPanel.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            errorPanel.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
            errorPanel.widthAnchor.constraint(lessThanOrEqualToConstant: 380),
            errorPanel.leadingAnchor.constraint(greaterThanOrEqualTo: safe.leadingAnchor, constant: 24),
            errorPanel.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -24),
            activity.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
        ])
        Task {
            let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
            let signedIn = cookies.contains {
                $0.name == MobileSignIn.sessionName && $0.domain == MobileSignIn.origin.host
            }
            load(signedIn ? MobileSignIn.origin.appending(path: "app") : MobileSignIn.origin)
        }
    }

    @objc private func goBack() { webView.goBack() }

    @objc private func reload() {
        errorPanel.isHidden = true
        webView.isHidden = false
        if webView.reload() == nil { load(MobileSignIn.origin) }
    }

    private func load(_ url: URL) {
        webView.load(URLRequest(url: url))
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if MobileSignIn.isFirstParty(url) {
            if action.targetFrame == nil { load(url) }
            return decisionHandler(action.targetFrame == nil ? .cancel : .allow)
        }
        if action.navigationType == .linkActivated, action.sourceFrame.isMainFrame,
           let source = action.sourceFrame.request.url, MobileSignIn.isFirstParty(source) {
            switch url.absoluteString {
            case "\(MobileSignIn.scheme)://start":
                startSignIn()
            case "\(MobileSignIn.scheme)://data":
                UIApplication.shared.open(URL(string: "/login?next=data", relativeTo: MobileSignIn.origin)!.absoluteURL)
            default:
                if ["https", "http", "mailto"].contains(url.scheme ?? "") {
                    UIApplication.shared.open(url)
                }
            }
        }
        decisionHandler(.cancel)
    }

    private func startSignIn() {
        guard !signingIn else { return }
        if NativeGoogleSignIn.isConfigured {
            signIn { theme in
                guard let token = try await NativeGoogleSignIn.firebaseIDToken(presenting: self) else { return nil }
                return try await MobileSignIn().exchange(idToken: token, theme: theme)
            }
            return
        }
        let attempt = MobileSignIn.begin()
        verifier = attempt.verifier
        UIApplication.shared.open(attempt.url) { [weak self] opened in
            if !opened { self?.signInError() }
        }
    }

    func finishSignIn(_ url: URL) {
        guard let code = MobileSignIn.callbackCode(url), !signingIn else { return }
        guard let verifier else { return signInError() }
        self.verifier = nil
        signIn { theme in
            try await MobileSignIn().exchange(code: code, verifier: verifier, theme: theme)
        }
    }

    private func signIn(_ authenticate: @escaping (HTTPCookie?) async throws -> MobileSignIn.Session?) {
        signingIn = true
        activity.startAnimating()
        Task {
            defer {
                signingIn = false
                activity.stopAnimating()
            }
            do {
                let store = webView.configuration.websiteDataStore.httpCookieStore
                let cookies = await store.allCookies().filter {
                    $0.domain == MobileSignIn.origin.host
                }
                let theme = cookies.first { $0.name == MobileSignIn.guestThemeName }
                guard let session = try await authenticate(theme) else { return }
                await store.setCookie(session.cookie)
                if session.needsAccountDeletion {
                    if let existing = cookies.first(where: { $0.name == MobileSignIn.sessionName }) {
                        await store.deleteCookie(existing)
                    }
                    load(MobileSignIn.origin.appending(path: "account/deletion"))
                } else {
                    if let theme { await store.deleteCookie(theme) }
                    load(MobileSignIn.origin.appending(path: "app"))
                }
            } catch {
                signInError()
            }
        }
    }

    private func signInError() {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(
            title: NSLocalizedString("Couldn’t sign in", comment: ""),
            message: NSLocalizedString("Return to LessonBrook and start Google sign-in again.", comment: ""),
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: ""), style: .default))
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.isHidden = false
        errorPanel.isHidden = true
        navigationItem.leftBarButtonItem?.isEnabled = webView.canGoBack
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        reload()
    }

    private func showLoadError(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        webView.isHidden = true
        errorPanel.isHidden = false
    }
}
