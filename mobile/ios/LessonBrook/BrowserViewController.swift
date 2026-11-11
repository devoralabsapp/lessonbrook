import SwiftUI
import UIKit
import WebKit

final class BrowserViewController: UIViewController, WKNavigationDelegate, UITabBarDelegate {
    private enum Screen { case welcome, today, more, page }
    private struct Availability: Decodable { let available: Bool }

    private let native = UIHostingController(rootView: AnyView(EmptyView()))
    private let content = UIView()
    private let tabs = UITabBar()
    private let activity = UIActivityIndicatorView(style: .large)
    private var bottom: NSLayoutConstraint?
    private var webView: WKWebView?
    private var webURL: NSKeyValueObservation?
    private var webRoot: String?
    private var screen = Screen.welcome
    private var selectedTab = WorkspaceTab.today
    private var returnTab = WorkspaceTab.today
    private var snapshot: WorkspaceSnapshot?
    private var locale = "en"
    private var request: Task<Void, Never>?
    private var verifier: String?
    private var signingIn = false
    private var signedIn = false

    private var cookies: WKHTTPCookieStore { WKWebsiteDataStore.default().httpCookieStore }
    private var palette: WorkspacePalette { WorkspacePalette(snapshot?.theme ?? "natura") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        content.translatesAutoresizingMaskIntoConstraints = false
        tabs.translatesAutoresizingMaskIntoConstraints = false
        tabs.delegate = self
        activity.translatesAutoresizingMaskIntoConstraints = false
        activity.hidesWhenStopped = true
        view.addSubview(content)
        view.addSubview(tabs)
        view.addSubview(activity)

        addChild(native)
        native.view.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(native.view)
        native.didMove(toParent: self)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: safe.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabs.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabs.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabs.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            tabs.heightAnchor.constraint(equalToConstant: 52),
            activity.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
        ])
        pin(native.view)
        configureChrome()
        request = Task {
            let saved = await originCookies()
            guard !Task.isCancelled else { return }
            updateLocale(saved)
            if saved.contains(where: { $0.name == MobileSignIn.sessionName }) {
                showToday()
            } else if saved.contains(where: { $0.name == "chotcong_deletion" }) {
                openPage("/account/deletion")
            } else {
                showWelcome()
            }
        }
    }

    private func pin(_ child: UIView) {
        NSLayoutConstraint.activate([
            child.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            child.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            child.topAnchor.constraint(equalTo: content.topAnchor),
            child.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
    }

    private func configureChrome() {
        let showTabs = screen == .today || screen == .more || (screen == .page && webRoot != "/account/deletion")
        tabs.isHidden = !showTabs
        bottom?.isActive = false
        bottom = content.bottomAnchor.constraint(equalTo: showTabs ? tabs.topAnchor : view.safeAreaLayoutGuide.bottomAnchor)
        bottom?.isActive = true
        tabs.items = WorkspaceTab.allCases.map {
            UITabBarItem(title: t($0.label), image: UIImage(systemName: $0.icon), tag: $0.rawValue)
        }
        tabs.selectedItem = tabs.items?[selectedTab.rawValue]
        tabs.tintColor = UIColor(palette.accent)
        view.backgroundColor = UIColor(palette.background)
        overrideUserInterfaceStyle = palette.dark ? .dark : .light
        navigationController?.navigationBar.tintColor = UIColor(palette.accent)
        navigationController?.setNavigationBarHidden(screen == .welcome, animated: false)
        title = screen == .page ? pageTitle(webView?.url?.path ?? webRoot ?? "") : t(selectedTab.label)
        if screen == .page {
            navigationItem.leftBarButtonItem = UIBarButtonItem(
                image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(goBack)
            )
            navigationItem.leftBarButtonItem?.accessibilityLabel = t("Back")
        } else {
            navigationItem.leftBarButtonItem = nil
        }
    }

    private func showNative(_ next: Screen, body: some View) {
        webURL = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        webRoot = nil
        screen = next
        native.view.isHidden = false
        native.rootView = AnyView(body)
        configureChrome()
    }

    private func showWelcome(expired: Bool = false) {
        request?.cancel()
        signedIn = false
        snapshot = nil
        selectedTab = .today
        showNative(.welcome, body: welcome(nil, expired: expired))
        request = Task {
            do {
                let status: Availability = try await MobileSignIn().get("api/auth/availability")
                guard !Task.isCancelled, screen == .welcome else { return }
                native.rootView = AnyView(welcome(status.available, expired: expired))
            } catch {
                guard !Task.isCancelled, screen == .welcome else { return }
                native.rootView = AnyView(welcome(nil, expired: expired, failed: true))
            }
        }
    }

    private func welcome(_ available: Bool?, expired: Bool, failed: Bool = false) -> NativeWelcome {
        NativeWelcome(
            locale: locale, available: available, expired: expired, checkFailed: failed,
            signIn: { [weak self] in self?.startSignIn() },
            retry: { [weak self] in self?.showWelcome(expired: expired) },
            changeLanguage: { [weak self] value in self?.setLanguage(value, expired: expired) },
            help: { UIApplication.shared.open(MobileSignIn.origin.appending(path: "help")) }
        )
    }

    private func setLanguage(_ language: String, expired: Bool) {
        guard language != locale, ["en", "vi"].contains(language) else { return }
        let header = "chotcong_locale=\(language); Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=Lax"
        guard let value = HTTPCookie.cookies(
            withResponseHeaderFields: ["Set-Cookie": header], for: MobileSignIn.origin
        ).first else { return }
        Task {
            await cookies.setCookie(value)
            guard screen == .welcome else { return }
            locale = language
            showWelcome(expired: expired)
        }
    }

    private func showToday() {
        request?.cancel()
        signedIn = true
        selectedTab = .today
        if let snapshot {
            showNative(.today, body: dashboard(snapshot))
        } else {
            showNative(.today, body: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity))
        }
        request = Task { await loadDashboard() }
    }

    private func dashboard(_ value: WorkspaceSnapshot) -> NativeDashboard {
        NativeDashboard(snapshot: value, open: { [weak self] path in self?.openPage(path) },
                        refresh: { [weak self] in await self?.loadDashboard() })
    }

    private func loadDashboard() async {
        let saved = await originCookies()
        do {
            let value: WorkspaceSnapshot = try await MobileSignIn().get(
                "api/mobile/workspace",
                cookies: saved.filter { [MobileSignIn.sessionName, "chotcong_locale"].contains($0.name) }
            )
            guard !Task.isCancelled, screen == .today else { return }
            snapshot = value
            locale = value.locale
            native.rootView = AnyView(dashboard(value))
            configureChrome()
        } catch MobileSignIn.Failure.expired {
            guard !Task.isCancelled, screen == .today else { return }
            if let session = saved.first(where: { $0.name == MobileSignIn.sessionName }) {
                await cookies.deleteCookie(session)
            }
            guard !Task.isCancelled, screen == .today else { return }
            showWelcome(expired: true)
        } catch MobileSignIn.Failure.deleting {
            guard !Task.isCancelled, screen == .today else { return }
            openPage("/account/deletion")
        } catch {
            guard !Task.isCancelled, screen == .today else { return }
            native.rootView = AnyView(failure { [weak self] in self?.showToday() })
        }
    }

    private func showMore() {
        request?.cancel()
        selectedTab = .more
        showNative(.more, body: NativeMore(locale: locale, palette: palette) { [weak self] path in
            self?.openPage(path)
        })
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard let next = WorkspaceTab(rawValue: item.tag) else { return }
        if let path = next.path { openPage(path) }
        else if next == .more { showMore() }
        else { showToday() }
    }

    private func openPage(_ path: String) {
        request?.cancel()
        returnTab = screen == .more ? .more : .today
        webURL = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webRoot = path
        screen = .page
        selectedTab = pageTab(path)
        native.view.isHidden = true

        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = NativeGoogleSignIn.isConfigured
            ? "LessonBrookApp/iOS NativeGoogleSignIn/1 NativeWorkspace/1"
            : "LessonBrookApp/iOS NativeWorkspace/1"
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        content.addSubview(web)
        pin(web)
        webView = web
        webURL = web.observe(\.url, options: [.new]) { [weak self] web, _ in
            DispatchQueue.main.async { self?.track(web) }
        }
        configureChrome()
        web.load(URLRequest(url: MobileSignIn.origin.appending(path: path)))
    }

    @objc private func goBack() {
        if let webView, webView.canGoBack {
            webView.goBack()
        } else if webRoot == "/account/deletion" {
            showWelcome()
        } else if returnTab == .more {
            showMore()
        } else {
            showToday()
        }
    }

    private func track(_ web: WKWebView) {
        guard web === webView, let url = web.url, MobileSignIn.isFirstParty(url) else { return }
        switch url.path {
        case "/app": showToday()
        case "/":
            if signedIn { showToday() } else { showWelcome() }
        case "/login":
            let expired = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.contains(where: { $0.name == "expired" }) ?? false
            showWelcome(expired: expired)
        case "/account/deletion":
            webRoot = url.path
            configureChrome()
        default:
            selectedTab = pageTab(url.path)
            title = pageTitle(url.path)
            tabs.selectedItem = tabs.items?[selectedTab.rawValue]
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if MobileSignIn.isFirstParty(url) {
            if action.targetFrame == nil { webView.load(action.request) }
            return decisionHandler(action.targetFrame == nil ? .cancel : .allow)
        }
        if action.navigationType == .linkActivated, action.sourceFrame.isMainFrame,
           let source = action.sourceFrame.request.url, MobileSignIn.isFirstParty(source) {
            if url.absoluteString == "\(MobileSignIn.scheme)://data" {
                UIApplication.shared.open(URL(string: "/login?next=data", relativeTo: MobileSignIn.origin)!.absoluteURL)
            } else if ["https", "http", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
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
        } else {
            let attempt = MobileSignIn.begin()
            verifier = attempt.verifier
            UIApplication.shared.open(attempt.url) { [weak self] opened in
                if !opened { self?.signInError() }
            }
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
                let saved = await originCookies()
                let theme = saved.first { $0.name == MobileSignIn.guestThemeName }
                guard let session = try await authenticate(theme) else { return }
                await cookies.setCookie(session.cookie)
                if session.needsAccountDeletion {
                    if let existing = saved.first(where: { $0.name == MobileSignIn.sessionName }) {
                        await cookies.deleteCookie(existing)
                    }
                    openPage("/account/deletion")
                } else {
                    if let theme { await cookies.deleteCookie(theme) }
                    showToday()
                }
            } catch {
                signInError()
            }
        }
    }

    private func signInError() {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(
            title: t("Couldn’t sign in"),
            message: t("Return to LessonBrook and start Google sign-in again."),
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: t("OK"), style: .default))
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        native.view.isHidden = true
        webView.isHidden = false
        track(webView)
        Task {
            let saved = await originCookies()
            guard webView === self.webView else { return }
            let previous = locale
            updateLocale(saved)
            if previous != locale { configureChrome() }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(webView, error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(webView, error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    private func showLoadError(_ web: WKWebView, _ error: Error) {
        guard web === webView, (error as NSError).code != NSURLErrorCancelled else { return }
        web.isHidden = true
        native.view.isHidden = false
        native.rootView = AnyView(failure { [weak web] in web?.reload() })
    }

    private func failure(_ retry: @escaping () -> Void) -> some View {
        VStack(spacing: 14) {
            Text(t("LessonBrook couldn’t load. Check your connection and try again."))
                .multilineTextAlignment(.center)
            Button(t("Try again"), action: retry).buttonStyle(.bordered)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.background)
    }

    private func originCookies() async -> [HTTPCookie] {
        await cookies.allCookies().filter { $0.domain == MobileSignIn.origin.host }
    }

    private func updateLocale(_ saved: [HTTPCookie]) {
        locale = saved.first(where: { $0.name == "chotcong_locale" })?.value == "vi" ? "vi" : "en"
    }

    private func pageTab(_ path: String) -> WorkspaceTab {
        if path.hasPrefix("/app/students") { return .students }
        if path.hasPrefix("/app/sessions") || path.hasPrefix("/app/lessons") { return .lessons }
        if path.hasPrefix("/app/statements") { return .tuition }
        return .more
    }

    private func pageTitle(_ path: String) -> String {
        switch path {
        case "/app/lessons/new": return t("Record a lesson")
        case "/app/classes": return t("Classes")
        case "/app/settings": return t("Account settings")
        case "/account/deletion": return t("Account deletion")
        case "/onboarding": return t("Get started")
        case "/help": return t("Help & support")
        default: return t(pageTab(path).label)
        }
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: locale) }
}
