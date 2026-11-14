import SwiftUI
import UIKit
import WebKit

final class WorkspaceNavigationController: UINavigationController {
    override var childForStatusBarStyle: UIViewController? { topViewController }
}

final class BrowserViewController: UIViewController, WKNavigationDelegate {
    private enum Screen { case welcome, today, page }
    private struct Availability: Decodable { let available: Bool }

    private let native = UIHostingController(rootView: AnyView(EmptyView()))
    private let content = UIView()
    private let header = UIView()
    private let headerTitle = UILabel()
    private let headerLine = UIView()
    private let backButton = UIButton(type: .system)
    private let appearanceButton = UIButton(type: .system)
    private let settingsButton = UIButton(type: .system)
    private let tabs = UIView()
    private let tabRow = UIStackView()
    private var tabButtons: [UIButton] = []
    private let activity = UIActivityIndicatorView(style: .large)
    private var bottom: NSLayoutConstraint?
    private var headerHeight: NSLayoutConstraint?
    private var tabHeight: NSLayoutConstraint?
    private var webView: WKWebView?
    private var webURL: NSKeyValueObservation?
    private var webRoot: String?
    private var screen = Screen.welcome
    private var selectedTab = WorkspaceTab.dashboard
    private var snapshot: WorkspaceSnapshot?
    private var dashboardDisplayed = false
    private var dashboardTheme: String?
    private var webTheme: String?
    private var locale = "en"
    private var request: Task<Void, Never>?
    private let dashboardClient = MobileSignIn()
    private var dashboardTimer: Timer?
    private var scheduleInitialized = false
    private var verifier: String?
    private var signingIn = false
    private var signedIn = false
    private var demoMode = false
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
        navigationController?.setNavigationBarHidden(true, animated: false)
        content.translatesAutoresizingMaskIntoConstraints = false
        tabs.translatesAutoresizingMaskIntoConstraints = false
        activity.translatesAutoresizingMaskIntoConstraints = false
        activity.hidesWhenStopped = true
        view.addSubview(header)
        view.addSubview(content)
        view.addSubview(tabs)
        view.addSubview(activity)

        addChild(native)
        native.view.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(native.view)
        native.didMove(toParent: self)
        let safe = view.safeAreaLayoutGuide
        configureHeader()
        configureTabs()
        headerHeight = header.heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: safe.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.topAnchor.constraint(equalTo: header.bottomAnchor),
            content.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabs.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabs.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabs.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            activity.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
        ])
        headerHeight?.isActive = true
        tabHeight = tabs.heightAnchor.constraint(equalToConstant: 0)
        tabHeight?.isActive = true
        pin(native.view)
        configureChrome()
        NotificationCenter.default.addObserver(self, selector: #selector(updateTextSize),
                                               name: UIContentSizeCategory.didChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(refreshOpenDashboard),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
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

    private func configureHeader() {
        header.translatesAutoresizingMaskIntoConstraints = false
        headerTitle.translatesAutoresizingMaskIntoConstraints = false
        headerLine.translatesAutoresizingMaskIntoConstraints = false
        headerTitle.textAlignment = .center
        headerTitle.font = UIFontMetrics(forTextStyle: .headline)
            .scaledFont(for: .systemFont(ofSize: 17, weight: .semibold))
        headerTitle.adjustsFontForContentSizeCategory = true
        headerTitle.lineBreakMode = .byTruncatingTail
        headerTitle.accessibilityTraits.insert(.header)
        headerTitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let tools = UIStackView(arrangedSubviews: [appearanceButton, settingsButton])
        tools.spacing = 4
        tools.translatesAutoresizingMaskIntoConstraints = false
        backButton.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(headerTitle)
        header.addSubview(backButton)
        header.addSubview(tools)
        header.addSubview(headerLine)
        for (button, icon, action) in [
            (backButton, "chevron.backward", #selector(goBack)),
            (appearanceButton, "paintpalette", #selector(openAppearance)),
            (settingsButton, "gearshape", #selector(openSettings)),
        ] {
            let image = UIImage(systemName: icon, withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .medium))
            button.setImage(image, for: .normal)
            button.addTarget(self, action: action, for: .touchUpInside)
            let width = button.widthAnchor.constraint(equalToConstant: 44)
            width.priority = .required - 1
            width.isActive = true
            button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        }
        NSLayoutConstraint.activate([
            backButton.leadingAnchor.constraint(equalTo: header.layoutMarginsGuide.leadingAnchor),
            backButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            tools.trailingAnchor.constraint(equalTo: header.layoutMarginsGuide.trailingAnchor),
            tools.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            headerTitle.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            headerTitle.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            headerTitle.widthAnchor.constraint(lessThanOrEqualTo: header.widthAnchor, constant: -216),
            headerLine.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            headerLine.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            headerLine.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            headerLine.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),
        ])
    }

    @objc private func updateTextSize() {
        let scale = UIFontMetrics(forTextStyle: .body).scaledValue(for: 17) / 17
        webView?.pageZoom = min(max(scale, 1), 1.6)
        styleTabs()
        headerHeight?.constant = screen == .welcome ? 0 : max(52, headerTitle.font.lineHeight + 16)
    }

    private func configureTabs() {
        tabs.accessibilityIdentifier = "workspace-tabs"
        tabs.accessibilityTraits = [.tabBar]
        tabs.isAccessibilityElement = false
        tabRow.translatesAutoresizingMaskIntoConstraints = false
        tabRow.distribution = .fillEqually
        tabRow.spacing = 4
        tabs.addSubview(tabRow)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            tabRow.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 8),
            tabRow.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -8),
            tabRow.topAnchor.constraint(equalTo: tabs.topAnchor, constant: 4),
            tabRow.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -3),
        ])
        for tab in WorkspaceTab.allCases {
            let button = UIButton(type: .system)
            button.tag = tab.rawValue
            button.accessibilityIdentifier = "workspace-tab-\(tab.label.lowercased())"
            button.addTarget(self, action: #selector(selectTab(_:)), for: .touchUpInside)
            tabRow.addArrangedSubview(button)
            tabButtons.append(button)
        }
    }

    private func styleTabs() {
        let colors = palette
        let fontSize = min(UIFontMetrics(forTextStyle: .caption2).scaledValue(for: 11), 17)
        tabHeight?.constant = max(53, fontSize * 2.4 + 27) + view.safeAreaInsets.bottom
        tabs.backgroundColor = UIColor(colors.surface)
        for (tab, button) in zip(WorkspaceTab.allCases, tabButtons) {
            let selected = tab == selectedTab
            let label = t(tab.label)
            let font = UIFont.systemFont(ofSize: fontSize, weight: selected ? .bold : .medium)
            let design: UIFontDescriptor.SystemDesign
            switch colors.fontDesign {
            case .monospaced: design = .monospaced
            case .serif: design = .serif
            case .rounded: design = .rounded
            default: design = .default
            }
            let titleFont = font.fontDescriptor.withDesign(design).map { UIFont(descriptor: $0, size: fontSize) } ?? font
            var config = UIButton.Configuration.plain()
            config.image = UIImage(systemName: tab.icon, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold))
            config.imagePlacement = .top
            config.imagePadding = 3
            config.contentInsets = NSDirectionalEdgeInsets(top: 3, leading: 1, bottom: 3, trailing: 1)
            config.titleAlignment = .center
            config.titleLineBreakMode = .byWordWrapping
            config.attributedTitle = AttributedString(label, attributes: AttributeContainer([.font: titleFont]))
            config.baseForegroundColor = UIColor(selected ? colors.onAccent : colors.foreground)
            config.background.backgroundColor = selected ? UIColor(colors.accent) : .clear
            config.background.strokeColor = selected ? UIColor(colors.border) : .clear
            config.background.strokeWidth = selected ? colors.outline : 0
            config.background.cornerRadius = min(colors.radius, 12)
            config.cornerStyle = .fixed
            button.configuration = config
            button.titleLabel?.numberOfLines = 2
            button.titleLabel?.adjustsFontSizeToFitWidth = true
            button.titleLabel?.minimumScaleFactor = 0.8
            button.accessibilityLabel = label
            button.accessibilityTraits = selected ? [.button, .selected] : [.button]
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        styleTabs()
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
        bottom?.priority = .defaultHigh
        bottom?.isActive = true
        let ink = UIColor(palette.foreground)
        let accent = UIColor(palette.controlTint)
        view.backgroundColor = UIColor(palette.background)
        overrideUserInterfaceStyle = palette.dark ? .dark : .light
        navigationController?.setNeedsStatusBarAppearanceUpdate()
        let path = workspacePath(webView?.url?.path ?? webRoot ?? "")
        header.isHidden = screen == .welcome
        updateTextSize()
        header.backgroundColor = UIColor(palette.background)
        headerLine.backgroundColor = ink.withAlphaComponent(0.15)
        headerTitle.text = screen == .page ? pageTitle(path) : t(selectedTab.label)
        headerTitle.textColor = ink
        backButton.isHidden = screen != .page || path == "/app" || WorkspaceTab.allCases.contains(where: { $0.path == path })
        backButton.tintColor = ink
        backButton.accessibilityLabel = t("Back")
        appearanceButton.isHidden = !showTabs || path == "/app/appearance"
        appearanceButton.tintColor = accent
        appearanceButton.accessibilityLabel = t("Choose a theme")
        settingsButton.isHidden = !showTabs || path == "/app/settings"
        settingsButton.tintColor = ink
        settingsButton.accessibilityLabel = t("Account settings")
    }

    @objc private func openSettings() { openToolbarPage("/app/settings") }
    @objc private func openAppearance() { openToolbarPage("/app/appearance") }

    private func openToolbarPage(_ path: String) {
        if demoMode {
            beforeLeavingPage { [self] in switchWebTab(selectedTab, path: path) }
            return
        }
        let path = destination(path)
        beforeLeavingPage { [self] in
            if let webView, let current = webView.url, MobileSignIn.isFirstParty(current),
               let url = URL(string: path, relativeTo: MobileSignIn.origin)?.absoluteURL {
                if current.path != path { webView.load(URLRequest(url: url)) }
            } else {
                openPage(path)
            }
        }
    }

    private func showNative(_ next: Screen, body: some View, reuseDashboard: Bool = false) {
        activity.stopAnimating()
        dashboardTimer?.invalidate()
        dashboardTimer = nil
        webURL = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        webRoot = nil
        screen = next
        native.view.isHidden = false
        if !reuseDashboard { native.rootView = AnyView(body) }
        configureChrome()
    }

    private func showWelcome(expired: Bool = false) {
        request?.cancel()
        signedIn = false
        demoMode = false
        scheduleInitialized = false
        snapshot = nil
        dashboardDisplayed = false
        dashboardTheme = nil
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
            demo: { [weak self] in self?.showDemo() },
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

    private func showDemo() {
        demoMode = true
        snapshot = nil
        dashboardDisplayed = false
        dashboardTheme = nil
        webTheme = nil
        selectedTab = .dashboard
        openPage("/app")
    }

    // Only fixed workspace routes are mapped. Authentication and shared links
    // always keep their original destinations.
    private func destination(_ path: String) -> String {
        guard demoMode else { return path }
        if path == "/app" { return "/demo" }
        if path.hasPrefix("/app/") { return "/demo/" + path.dropFirst(5) }
        if path == "/onboarding" { return "/demo/onboarding" }
        return path
    }

    private func workspacePath(_ path: String) -> String {
        if path == "/demo" { return "/app" }
        if path.hasPrefix("/demo/") { return "/app/" + path.dropFirst(6) }
        return path
    }

    private func showToday() {
        demoMode = false
        request?.cancel()
        signedIn = true
        selectedTab = .dashboard
        if let snapshot {
            let theme = webTheme ?? snapshot.theme
            showNative(.today, body: dashboard(snapshot),
                       reuseDashboard: dashboardDisplayed && dashboardTheme == theme)
            dashboardDisplayed = true
            dashboardTheme = theme
        } else {
            showNative(.today, body: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity))
        }
        request = Task { await loadDashboard() }
        dashboardTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.refreshOpenDashboard() }
        }
    }

    @objc private func refreshOpenDashboard() {
        guard screen == .today, snapshot != nil, UIApplication.shared.applicationState == .active else { return }
        request?.cancel()
        request = Task { await loadDashboard(quiet: true) }
    }

    private func dashboard(_ value: WorkspaceSnapshot) -> NativeDashboard {
        NativeDashboard(snapshot: value, theme: webTheme, open: { [weak self] path in self?.openPage(path) },
                        refresh: { [weak self] in await self?.loadDashboard() })
    }

    private func loadDashboard(quiet: Bool = false) async {
        let saved = await originCookies()
        do {
            let value = try await dashboardClient.workspace(
                cookies: saved.filter { [MobileSignIn.sessionName, "chotcong_locale"].contains($0.name) },
                initialize: !scheduleInitialized
            )
            guard !Task.isCancelled, screen == .today else { return }
            scheduleInitialized = true
            // Keep the mounted dashboard/scroll position when validation finds no change.
            let changed = !dashboardDisplayed || snapshot != value ||
                dashboardTheme != value.theme
            snapshot = value
            webTheme = nil
            locale = value.locale
            if changed {
                native.rootView = AnyView(dashboard(value))
                dashboardDisplayed = true
                dashboardTheme = value.theme
                configureChrome()
            }
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
            guard !quiet, !Task.isCancelled, screen == .today else { return }
            dashboardDisplayed = false
            native.rootView = AnyView(failure { [weak self] in self?.showToday() })
        }
    }

    @objc private func selectTab(_ button: UIButton) {
        guard let next = WorkspaceTab(rawValue: button.tag) else { return }
        beforeLeavingPage { [self] in
            if let path = next.path { switchWebTab(next, path: path) }
            else if demoMode { switchWebTab(next, path: "/app") }
            else { showToday() }
        }
    }

    private func switchWebTab(_ next: WorkspaceTab, path: String) {
        guard let web = webView, !web.isHidden, let source = web.url,
              MobileSignIn.isFirstParty(source),
              source.path.hasPrefix(demoMode ? "/demo" : "/app/") else {
            return openPage(path)
        }
        // WorkspaceTab paths are fixed first-party destinations.
        let script = "!window.dispatchEvent(new CustomEvent('lessonbrook:navigate-tab', {cancelable: true, detail: '\(path)'}))"
        web.evaluateJavaScript(script) { [weak self, weak web] accepted, _ in
            guard let self, let web, web === webView else { return }
            if accepted as? Bool == true {
                webRoot = destination(path)
                selectedTab = next
                configureChrome()
            } else if web.url == source {
                openPage(path)
            }
        }
    }

    private func openPage(_ path: String) {
        let path = destination(path)
        guard let url = URL(string: path, relativeTo: MobileSignIn.origin)?.absoluteURL,
              MobileSignIn.isFirstParty(url) else { return }
        dashboardTimer?.invalidate()
        dashboardTimer = nil
        request?.cancel()
        webURL = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webRoot = path
        screen = .page
        selectedTab = pageTab(path) ?? selectedTab
        native.view.isHidden = true

        let configuration = WKWebViewConfiguration()
        configuration.ignoresViewportScaleLimits = false
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
        updateTextSize()
        webURL = web.observe(\.url, options: [.new]) { [weak self] web, _ in
            DispatchQueue.main.async { self?.track(web) }
        }
        configureChrome()
        activity.startAnimating()
        web.load(URLRequest(url: url))
    }

    @objc private func goBack() {
        beforeLeavingPage { [self] in goBackFromPage() }
    }

    private func goBackFromPage() {
        if let webView, webView.canGoBack, webView.url?.path != webRoot {
            webView.goBack()
        } else if webRoot == "/account/deletion" {
            showWelcome()
        } else if demoMode {
            openPage("/app")
        } else {
            showToday()
        }
    }

    private func beforeLeavingPage(_ leave: @escaping () -> Void) {
        guard !checkingDraft, presentedViewController == nil else { return }
        guard let web = webView, let url = web.url, MobileSignIn.isFirstParty(url),
              url.path.hasPrefix("/app/") || url.path.hasPrefix("/demo") || url.path == "/onboarding"
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
        case "/demo":
            demoMode = true
            selectedTab = .dashboard
            configureChrome()
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
        activity.stopAnimating()
        native.view.isHidden = true
        webView.isHidden = false
        track(webView)
        if let url = webView.url, MobileSignIn.isFirstParty(url) {
            webView.evaluateJavaScript("document.querySelector('[data-saved-theme]')?.dataset.savedTheme") { [weak self, weak webView] value, _ in
                guard let self, let webView, webView === self.webView, webView.url == url,
                      let theme = value as? String, !theme.isEmpty, theme != self.webTheme else { return }
                self.webTheme = theme
                self.configureChrome()
            }
        }
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
        activity.stopAnimating()
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
        let path = workspacePath(path)
        if path.hasPrefix("/app/students") { return .students }
        if path.hasPrefix("/app/sessions") || path.hasPrefix("/app/lessons") || path == "/app/schedule" { return .lessons }
        if path.hasPrefix("/app/statements") { return .statements }
        if path.hasPrefix("/app/classes") { return .classes }
        return nil
    }

    private func pageTitle(_ path: String) -> String {
        switch workspacePath(path) {
        case "/app/lessons/new": return t("Record a lesson")
        case "/app/schedule": return t("Upcoming lessons")
        case "/app/classes": return t("Classes")
        case "/app/statements/new": return t("Create statement")
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
