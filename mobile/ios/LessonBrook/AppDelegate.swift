import SwiftUI
import OSLog

@main
@MainActor
struct LessonBrookApp: App {
    @StateObject private var store = WorkspaceStore()
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    init() { NativeGoogleSignIn.configure() }

    var body: some Scene {
        WindowGroup {
            Group {
                switch store.phase {
                case .starting:
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                case .welcome:
                    NativeWelcome(locale: store.locale, available: store.available, expired: store.expired,
                        checkFailed: store.availabilityFailed,
                        signIn: { Task { await store.beginSignIn(open: openURL) } },
                        demo: { Task { await store.startDemo() } },
                        retry: { Task { await store.welcome() } },
                        changeLanguage: store.setLanguage,
                        help: { openURL(MobileSignIn.origin.appending(path: "help")) })
                case .workspace:
                    WorkspaceTabs()
                case .deletion:
                    AccountDeletionView()
                }
            }
            .environmentObject(store)
            .environment(\.locale, store.language)
            .environment(\.timeZone, LedgerDate.zone)
            .environment(\.calendar, LedgerDate.calendar)
            .preferredColorScheme(store.palette.dark ? .dark : .light)
            .background(store.palette.background.ignoresSafeArea())
            .overlay {
                if store.signingIn {
                    ProgressView().padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .alert(store.t("LessonBrook"), isPresented: Binding(
                get: { store.error != nil },
                set: { if !$0 { store.error = nil } }
            )) {
                Button(store.t("OK")) { store.error = nil }
            } message: {
                Text(store.error ?? "")
            }
            .task { await store.load() }
            .onOpenURL { url in Task { await store.openURL(url) } }
            .onChange(of: scenePhase) { phase in
                if phase == .active { Task { await store.refreshDashboard() } }
            }
        }
    }
}

enum WorkspaceRoute: Hashable {
    case student(String), teachingClass(String), session(String), lesson(String), statement(String)
    case studentHistory(LedgerKind, String), classHistory(String)
    case recordLesson(classID: String? = nil, date: String? = nil, time: String? = nil)
    case schedule, settings, onboarding, createStatement(String?)

    static func from(_ path: String) -> Self? {
        guard let url = URLComponents(string: path) else { return nil }
        let pieces = url.path.split(separator: "/").map(String.init)
        if pieces == ["onboarding"] { return .onboarding }
        if pieces == ["app", "schedule"] { return .schedule }
        guard pieces.count == 3, pieces.first == "app" else { return nil }
        switch pieces[1] {
        case "students": return .student(pieces[2])
        case "classes": return .teachingClass(pieces[2])
        case "sessions": return .session(pieces[2])
        case "statements": return .statement(pieces[2])
        case "lessons":
            if pieces[2] == "new" {
                func value(_ name: String) -> String? { url.queryItems?.first { $0.name == name }?.value }
                return .recordLesson(classID: value("classId"), date: value("date"), time: value("time"))
            }
            return .lesson(pieces[2])
        default: return nil
        }
    }
}

struct WorkspaceTabs: View {
    @EnvironmentObject private var store: WorkspaceStore
    @State private var selection = WorkspaceTab.dashboard
    @State private var paths: [WorkspaceTab: [WorkspaceRoute]] = [:]
    private enum HeaderMenu { case language, appearance }

    @State private var headerMenu: HeaderMenu?
    @State private var discardNavigation = false
    @State private var pendingNavigation: (() -> Void)?
    @Environment(\.openURL) private var openURL
    private let logger = Logger(subsystem: "tech.devoralabs.lessonbrook", category: "performance")

    var body: some View {
        VStack(spacing: 0) {
            header
            TabView(selection: $selection) {
                ForEach(WorkspaceTab.allCases, id: \.self) { tab in
                    NavigationStack(path: Binding(get: { paths[tab] ?? [] }, set: { paths[tab] = $0 })) {
                        screen(tab)
                            .navigationDestination(for: WorkspaceRoute.self) { route in
                                destination(route, in: tab).toolbar(.hidden, for: .navigationBar)
                            }
                            .toolbar(.hidden, for: .navigationBar)
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(tab)
                }
            }
            .frame(maxHeight: .infinity)
            .clipped()
            .accessibilityHidden(headerMenu != nil)
            .overlay(alignment: .topTrailing) {
                if let headerMenu {
                    ZStack(alignment: .topTrailing) {
                        Color.clear.contentShape(Rectangle())
                            .onTapGesture { dismissHeaderMenu() }
                            .accessibilityHidden(true)
                        switch headerMenu {
                        case .appearance:
                            NativeAppearance()
                                .frame(maxWidth: 490)
                                .padding(.horizontal, 17).padding(.top, 7).padding(.bottom, 13)
                        case .language:
                            languageMenu.padding(.trailing, 12).padding(.top, 7)
                        }
                    }
                    .accessibilityAction(.escape) { dismissHeaderMenu() }
                }
            }
            tabs
        }
        .environment(\.openWorkspaceRoot, openRoot)
        .tint(store.palette.controlTint)
        .font(store.palette.font())
        .buttonStyle(WorkspaceOutlineButton(palette: store.palette))
        .toggleStyle(WorkspaceCheckbox())
        .confirmationDialog(store.t("Discard unsaved changes?"), isPresented: $discardNavigation, titleVisibility: .visible) {
            Button(store.t("Discard changes"), role: .destructive) {
                store.hasUnsavedEdits = false
                pendingNavigation?()
                pendingNavigation = nil
            }
            Button(store.t("Keep editing"), role: .cancel) { pendingNavigation = nil }
        }
        .onChange(of: selection) { tab in
            if tab == .dashboard { Task { await store.refreshDashboard() } }
        }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 60_000_000_000) } catch { return }
                await store.refreshDashboard()
            }
        }
    }

    private var header: some View {
        let palette = store.palette
        let onSettings = paths[selection]?.last == .settings
        let initial = (store.snapshot?.displayName.first.map(String.init) ?? (store.demo ? "D" : "")).uppercased()
        return HStack(spacing: 6) {
            Button {
                openRoot(.dashboard)
            } label: {
                WorkspaceBrand(palette: palette)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("LessonBrook")
            .accessibilityIdentifier("workspace-brand")
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                headerButton("Language", selected: headerMenu == .language, action: { toggleHeaderMenu(.language) }) {
                    Image(systemName: "globe").font(.system(size: 16, weight: .medium))
                }
                headerButton("Choose a theme", selected: headerMenu == .appearance, action: { toggleHeaderMenu(.appearance) }) {
                    Image(systemName: "paintpalette").font(.system(size: 16, weight: .medium))
                }
                if store.demo {
                    headerButton("Sign in", action: {
                        navigateFromHeader { Task { await store.beginSignIn(open: openURL) } }
                    }) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 16, weight: .medium))
                    }
                    .accessibilityIdentifier("workspace-demo-sign-in")
                }
                headerButton("Account settings", avatar: true, selected: onSettings, action: {
                    if onSettings {
                        dismissHeaderMenu()
                    } else {
                        navigateFromHeader { push(.settings, in: selection) }
                    }
                }) {
                    if initial.isEmpty {
                        Image(systemName: "person").font(.system(size: 16, weight: .medium))
                    } else {
                        Text(initial).font(palette.font(16, .bold)).lineLimit(1)
                    }
                }
            }
            .fixedSize()
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 64)
        .foregroundStyle(palette.foreground)
        .background(palette.surface)
        .overlay {
            Rectangle().strokeBorder(palette.border, lineWidth: palette.outline)
                .allowsHitTesting(false)
        }
        .disabled(store.saving)
    }

    private func headerButton<Label: View>(
        _ title: String, avatar: Bool = false, selected: Bool = false,
        action: @escaping () -> Void, @ViewBuilder label: () -> Label
    ) -> some View {
        let p = store.palette
        let shadow = avatar ? 0 : min(3, p.shadowOffset)
        return Button(action: action) {
            label()
                .foregroundStyle(avatar ? p.onAccent : p.foreground)
                .frame(width: avatar ? 35 : 41, height: avatar ? 35 : 41)
                .background(avatar ? p.accent : p.surface, in: Circle())
                .overlay(Circle().strokeBorder(p.border, lineWidth: avatar ? 1 : p.outline))
                .background(Circle().fill(p.border).offset(x: shadow, y: shadow))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(store.t(title))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var languageMenu: some View {
        let p = store.palette
        return VStack(spacing: 5) {
            WorkspaceOptionRow(title: "English", selected: store.locale == "en") { chooseLanguage("en") }
            WorkspaceOptionRow(title: "Tiếng Việt", selected: store.locale == "vi") { chooseLanguage("vi") }
        }
        .padding(8)
        .frame(width: 170)
        .modifier(WorkspacePanel(palette: p, fill: p.surface))
    }

    private func chooseLanguage(_ locale: String) {
        navigateFromHeader { store.setLanguage(locale) }
    }

    private func toggleHeaderMenu(_ menu: HeaderMenu) {
        let wasOpen = headerMenu == menu
        dismissHeaderMenu()
        if !wasOpen { headerMenu = menu }
    }

    private func dismissHeaderMenu() {
        guard !store.saving else { return }
        headerMenu = nil
        store.previewTheme = nil
    }

    private func openRoot(_ tab: WorkspaceTab) {
        navigateFromHeader {
            paths[tab] = []
            selection = tab
        }
    }

    private func navigateFromHeader(_ action: @escaping () -> Void) {
        guard !store.saving else { return }
        dismissHeaderMenu()
        if store.hasUnsavedEdits {
            pendingNavigation = action
            discardNavigation = true
        } else {
            action()
        }
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(WorkspaceTab.allCases, id: \.self) { tab in
                let selectedTab = selection == tab
                let page = paths[tab]?.last
                let active = selectedTab && page != .settings && page != .onboarding
                Button {
                    dismissHeaderMenu()
                    if selectedTab || page == .settings || page == .onboarding {
                        openRoot(tab)
                    } else {
                        logger.debug("Tab selected: \(tab.rawValue, privacy: .public)")
                        selection = tab
                    }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon).font(.system(size: 20))
                        Text(store.t(tab.label)).font(store.palette.font(13, active ? .bold : .semibold))
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(active ? store.palette.onAccent : store.palette.foreground)
                    .frame(maxWidth: .infinity, minHeight: 49)
                    .background(active ? store.palette.accent : .clear, in: RoundedRectangle(cornerRadius: store.palette.fieldRadius))
                    .overlay {
                        if active {
                            RoundedRectangle(cornerRadius: store.palette.fieldRadius)
                                .strokeBorder(store.palette.border, lineWidth: store.palette.outline)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(store.saving)
                .accessibilityAddTraits(active ? .isSelected : [])
                .accessibilityIdentifier("workspace-tab-\(String(describing: tab))")
            }
        }
        .padding(.top, store.palette.outline + 5)
        .padding(.bottom, 1)
        .background(store.palette.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(store.palette.border).frame(height: store.palette.outline) }
    }

    @ViewBuilder private func screen(_ tab: WorkspaceTab) -> some View {
        switch tab {
        case .dashboard:
            VStack(spacing: 0) {
                if let snapshot = store.snapshot {
                    NativeDashboard(snapshot: snapshot, theme: store.previewTheme ?? store.theme, open: { path in
                        if let route = WorkspaceRoute.from(path) { push(route, in: tab) }
                    }, refresh: { await store.refreshDashboard() })
                } else {
                    VStack(spacing: 16) {
                        ProgressView()
                        Button(store.t("Reload")) { Task { await store.refreshDashboard() } }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        case .students: LedgerDirectory(.students)
        case .classes: LedgerDirectory(.classes)
        case .lessons: LedgerDirectory(.sessions)
        case .statements: LedgerDirectory(.statements)
        }
    }

    @ViewBuilder private func destination(_ route: WorkspaceRoute, in tab: WorkspaceTab) -> some View {
        switch route {
        case .student(let id): LedgerRecordDetail(kind: .students, id: id)
        case .teachingClass(let id): LedgerRecordDetail(kind: .classes, id: id)
        case .session(let id): LedgerRecordDetail(kind: .sessions, id: id)
        case .lesson(let id): LedgerRecordDetail(kind: .lessons, id: id)
        case .statement(let id): NativeStatementDetail(id: id)
        case let .studentHistory(kind, id):
            LedgerDirectory(kind, relation: id.isEmpty ? [:] : ["studentId": id]).navigationTitle(store.t(kind.title))
        case .classHistory(let id): LedgerDirectory(.sessions, relation: ["classId": id]).navigationTitle(store.t("Lessons"))
        case let .recordLesson(classID, date, time):
            LessonEditor(classID: classID, proposedDate: date, proposedTime: time)
        case .schedule: NativeSchedule()
        case .createStatement(let studentID):
            StatementEditor(studentID: studentID) { id in
                guard paths[tab]?.last == route else { return }
                push(.statement(id), in: tab)
            }
        case .settings: NativeSettings()
        case .onboarding:
            NativeOnboarding(openDashboard: { openRoot(.dashboard) })
        }
    }

    private func push(_ route: WorkspaceRoute, in tab: WorkspaceTab) {
        paths[tab, default: []].append(route)
    }
}
