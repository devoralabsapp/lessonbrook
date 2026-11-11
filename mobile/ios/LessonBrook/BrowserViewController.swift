import SwiftUI
import UIKit
import WebKit

final class WorkspaceNavigationController: UINavigationController {
    override var childForStatusBarStyle: UIViewController? { topViewController }
}

final class BrowserViewController: UIViewController, WKNavigationDelegate, UITabBarDelegate {
    private enum Screen { case welcome, today, page }
    private struct Availability: Decodable { let available: Bool }

    private let native = UIHostingController(rootView: AnyView(EmptyView()))
    private let content = UIView()
    private let tabs = UITabBar()
    private let activity = UIActivityIndicatorView(style: .large)
    private var bottom: NSLayoutConstraint?
    private var tabHeight: NSLayoutConstraint?
    private var webView: WKWebView?
    private var webURL: NSKeyValueObservation?
    private var webRoot: String?
    private var screen = Screen.welcome
    private var selectedTab = WorkspaceTab.dashboard
    private var snapshot: WorkspaceSnapshot?
    private var webTheme: String?
    private var locale = "en"
    private var request: Task<Void, Never>?
    private var verifier: String?
    private var signingIn = false
    private var signedIn = false
    private var checkingDraft = false

    private static let draftState = """
        ({
            state: document.querySelector('[data-mobile-draft="saving"]') ? 'saving' :
                document.querySelector('[data-mobile-draft="dirty"]') ? 'dirty' : 'clean',
            theme: document.querySelector('[data-saved-theme]')?.dataset.savedTheme ?? ''
        })
        """
    private static let shareData = """
        (() => {
            const link = document.querySelector('[data-statement-share-url]');
            return link ? { url: link.dataset.statementShareUrl, text: link.dataset.statementShareMessage } : null;
        })()
        """

    private var cookies: WKHTTPCookieStore { WKWebsiteDataStore.default().httpCookieStore }
    private var palette: WorkspacePalette { WorkspacePalette(webTheme ?? snapshot?.theme) }
    override var preferredStatusBarStyle: UIStatusBarStyle { palette.dark ? .lightContent : .darkContent }

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
            tabs.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            activity.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
        ])
        tabHeight = tabs.heightAnchor.constraint(equalToConstant: 0)
        tabHeight?.isActive = true
        sizeTabs()
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

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        sizeTabs()
    }

    private func sizeTabs() {
        let barHeight: CGFloat
        if #available(iOS 26, *) {
            barHeight = 70
        } else {
            barHeight = 49
        }
        tabHeight?.constant = barHeight + view.safeAreaInsets.bottom
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
        let showTabs = screen == .today || (screen == .page && webRoot != "/account/deletion")
        tabs.isHidden = !showTabs
        bottom?.isActive = false
        bottom = content.bottomAnchor.constraint(equalTo: showTabs ? tabs.topAnchor : view.safeAreaLayoutGuide.bottomAnchor)
        bottom?.isActive = true
        tabs.items = WorkspaceTab.allCases.map {
            UITabBarItem(title: t($0.label), image: UIImage(systemName: $0.icon), tag: $0.rawValue)
        }
        tabs.selectedItem = tabs.items?[selectedTab.rawValue]
        let surface = UIColor(palette.surface)
        let ink = UIColor(palette.foreground)
        let accent = UIColor(palette.accent)
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = surface
        for item in [tabAppearance.stackedLayoutAppearance, tabAppearance.inlineLayoutAppearance,
                     tabAppearance.compactInlineLayoutAppearance] {
            item.normal.iconColor = ink
            item.normal.titleTextAttributes = [.foregroundColor: ink]
            item.selected.iconColor = accent
            item.selected.titleTextAttributes = [.foregroundColor: accent]
        }
        tabs.standardAppearance = tabAppearance
        tabs.scrollEdgeAppearance = tabAppearance
        tabs.tintColor = accent
        view.backgroundColor = UIColor(palette.background)
        overrideUserInterfaceStyle = palette.dark ? .dark : .light
        let barAppearance = UINavigationBarAppearance()
        barAppearance.configureWithOpaqueBackground()
        barAppearance.backgroundColor = surface
        barAppearance.titleTextAttributes = [.foregroundColor: ink]
        barAppearance.largeTitleTextAttributes = [.foregroundColor: ink]
        let bar = navigationController?.navigationBar
        bar?.standardAppearance = barAppearance
        bar?.compactAppearance = barAppearance
        bar?.scrollEdgeAppearance = barAppearance
        bar?.compactScrollEdgeAppearance = barAppearance
        bar?.tintColor = ink
        navigationController?.setNavigationBarHidden(screen == .welcome, animated: false)
        navigationController?.setNeedsStatusBarAppearanceUpdate()
        let path = webView?.url?.path ?? webRoot ?? ""
        title = screen == .page ? pageTitle(path) : t(selectedTab.label)
        navigationItem.rightBarButtonItems = showTabs ? [
            path == "/app/settings" ? nil : toolbarItem("gearshape", "Account settings", #selector(openSettings)),
            path == "/app/appearance" ? nil : toolbarItem("paintpalette", "Choose a theme", #selector(openAppearance))
        ].compactMap { $0 } : []
        if screen == .page {
            navigationItem.leftBarButtonItem = UIBarButtonItem(
                image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(goBack)
            )
            navigationItem.leftBarButtonItem?.accessibilityLabel = t("Back")
        } else {
            navigationItem.leftBarButtonItem = nil
        }
    }

    private func toolbarItem(_ image: String, _ label: String, _ action: Selector) -> UIBarButtonItem {
        let item = UIBarButtonItem(image: UIImage(systemName: image), style: .plain, target: self, action: action)
        item.accessibilityLabel = t(label)
        return item
    }

    @objc private func openSettings() { openToolbarPage("/app/settings") }
    @objc private func openAppearance() { openToolbarPage("/app/appearance") }

    private func openToolbarPage(_ path: String) {
        beforeLeavingPage { [self] in
            if let webView, let current = webView.url, MobileSignIn.isFirstParty(current),
               let url = URL(string: path, relativeTo: MobileSignIn.origin)?.absoluteURL {
                if current.path != path { webView.load(URLRequest(url: url)) }
            } else {
                openPage(path)
            }
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
        webTheme = nil
        selectedTab = .dashboard
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
        selectedTab = .dashboard
        if let snapshot {
            showNative(.today, body: dashboard(snapshot))
        } else {
            showNative(.today, body: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity))
        }
        request = Task { await loadDashboard() }
    }

    private func dashboard(_ value: WorkspaceSnapshot) -> NativeDashboard {
        NativeDashboard(snapshot: value, theme: webTheme, open: { [weak self] path in self?.openPage(path) },
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
            webTheme = nil
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

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard let next = WorkspaceTab(rawValue: item.tag) else { return }
        tabBar.selectedItem = tabs.items?[selectedTab.rawValue]
        beforeLeavingPage { [self] in
            if let path = next.path { openPage(path) }
            else { showToday() }
        }
    }

    private func openPage(_ path: String) {
        guard let url = URL(string: path, relativeTo: MobileSignIn.origin)?.absoluteURL,
              MobileSignIn.isFirstParty(url) else { return }
        request?.cancel()
        webURL = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webRoot = path
        screen = .page
        selectedTab = pageTab(path) ?? selectedTab
        native.view.isHidden = true

        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = NativeGoogleSignIn.isConfigured
            ? "LessonBrookApp/iOS NativeGoogleSignIn/1 NativeWorkspace/1 MobileActions/1 NativeChrome/1"
            : "LessonBrookApp/iOS NativeWorkspace/1 MobileActions/1 NativeChrome/1"
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
        web.load(URLRequest(url: url))
    }

    @objc private func goBack() {
        beforeLeavingPage { [self] in goBackFromPage() }
    }

    private func goBackFromPage() {
        if let webView, webView.canGoBack {
            webView.goBack()
        } else if webRoot == "/account/deletion" {
            showWelcome()
        } else {
            showToday()
        }
    }

    private func beforeLeavingPage(_ leave: @escaping () -> Void) {
        guard !checkingDraft, presentedViewController == nil else { return }
        guard let web = webView, let url = web.url, MobileSignIn.isFirstParty(url),
              url.path.hasPrefix("/app/") || url.path == "/onboarding"
        else { return leave() }
        checkingDraft = true
        web.evaluateJavaScript(Self.draftState) { [weak self, weak web] value, _ in
            guard let self else { return }
            checkingDraft = false
            guard let web, web === webView, web.url == url else { return }
            let state = value as? [String: String]
            if let theme = state?["theme"], !theme.isEmpty { webTheme = theme }
            if state?["state"] == "clean" { return leave() }
            let saving = state?["state"] == "saving"
            let alert = UIAlertController(
                title: t(saving ? "Saving changes" : "Unsaved changes"),
                message: t(saving ? "Wait for the save to finish before leaving."
                                  : "Your changes will be lost if you leave this screen."),
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: t(saving ? "OK" : "Keep editing"), style: .cancel))
            if !saving {
                alert.addAction(UIAlertAction(title: t("Discard changes"), style: .destructive) { [weak self, weak web] _ in
                    guard let self, let web, web === webView, web.url == url else { return }
                    leave()
                })
            }
            present(alert, animated: true)
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
            selectedTab = pageTab(url.path) ?? selectedTab
            configureChrome()
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
            if url.absoluteString == "\(MobileSignIn.scheme)://share-statement",
               let current = webView.url, MobileSignIn.isFirstParty(current),
               current.path.hasPrefix("/app/statements/"), webView === self.webView,
               action.targetFrame?.isMainFrame != false {
                shareStatement(from: webView, at: current)
            } else if url.absoluteString == "\(MobileSignIn.scheme)://data" {
                UIApplication.shared.open(URL(string: "/login?next=data", relativeTo: MobileSignIn.origin)!.absoluteURL)
            } else if ["https", "http", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
        decisionHandler(.cancel)
    }

    private func shareStatement(from web: WKWebView, at source: URL) {
        web.evaluateJavaScript(Self.shareData) { [weak self, weak web] value, _ in
            guard let self, let web, web === webView, web.url == source,
                  presentedViewController == nil,
                  let data = value as? [String: String], let address = data["url"],
                  let text = data["text"], text.utf8.count <= 4096, text.hasSuffix(address),
                  let url = URL(string: address), MobileSignIn.isFirstParty(url),
                  url.path == "/s", url.query == nil,
                  let token = url.fragment, token.range(of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil
            else { return }
            let picker = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            picker.popoverPresentationController?.sourceView = web
            picker.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.midY, width: 1, height: 1)
            present(picker, animated: true)
        }
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

    private func pageTab(_ path: String) -> WorkspaceTab? {
        if path.hasPrefix("/app/students") { return .students }
        if path.hasPrefix("/app/sessions") || path.hasPrefix("/app/lessons") || path == "/app/schedule" { return .lessons }
        if path.hasPrefix("/app/statements") { return .statements }
        if path.hasPrefix("/app/classes") { return .classes }
        return nil
    }

    private func pageTitle(_ path: String) -> String {
        switch path {
        case "/app/lessons/new": return t("Record a lesson")
        case "/app/schedule": return t("Upcoming lessons")
        case "/app/classes": return t("Classes")
        case "/app/settings": return t("Account settings")
        case "/app/appearance": return t("Appearance")
        case "/account/deletion": return t("Account deletion")
        case "/onboarding": return t("Get started")
        case "/help": return t("Help & support")
        default: return t((pageTab(path) ?? selectedTab).label)
        }
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: locale) }
}
