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
    case studentHistory(LedgerKind, String), classHistory(String), recordStudentLesson(String)
    case recordLesson(classID: String? = nil, date: String? = nil, time: String? = nil)
    case schedule, settings, appearance, onboarding

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
    @State private var appearance = false
    @State private var discardNavigation = false
    @State private var pendingBack: WorkspaceTab?
    @Environment(\.openURL) private var openURL
    @Environment(\.displayScale) private var displayScale
    private let logger = Logger(subsystem: "tech.devoralabs.lessonbrook", category: "performance")

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $selection) {
                ForEach(WorkspaceTab.allCases, id: \.self) { tab in
                    VStack(spacing: 0) {
                        header(tab)
                        NavigationStack(path: Binding(get: { paths[tab] ?? [] }, set: { paths[tab] = $0 })) {
                            screen(tab)
                                .navigationDestination(for: WorkspaceRoute.self) { route in
                                    destination(route).toolbar(.hidden, for: .navigationBar)
                                }
                                .toolbar(.hidden, for: .navigationBar)
                        }
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(tab)
                }
            }
            .frame(maxHeight: .infinity)
            .clipped()
            tabs
        }
        .sheet(isPresented: $appearance) { NativeAppearance() }
        .tint(store.palette.controlTint)
        .font(store.palette.font())
        .buttonStyle(WorkspaceOutlineButton(palette: store.palette))
        .toggleStyle(WorkspaceCheckbox())
        .confirmationDialog(store.t("Discard unsaved changes?"), isPresented: $discardNavigation, titleVisibility: .visible) {
            Button(store.t("Discard changes"), role: .destructive) { if let tab = pendingBack { goBack(tab) } }
            Button(store.t("Keep editing"), role: .cancel) { pendingBack = nil }
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

    private func header(_ tab: WorkspaceTab) -> some View {
        let currentPage = paths[tab]?.last
        let palette = store.palette
        return VStack(spacing: 0) {
            ZStack {
                Text(store.t(headerTitle(tab))).font(.headline)
                    .lineLimit(2).minimumScaleFactor(0.8).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).padding(.horizontal, 108)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: 4) {
                    if currentPage != nil {
                        headerIcon("chevron.backward", label: "Back", tint: palette.foreground) {
                            if store.hasUnsavedEdits { pendingBack = tab; discardNavigation = true }
                            else { goBack(tab) }
                        }
                    }
                    Spacer(minLength: 0)
                    if currentPage != .appearance {
                        headerIcon("paintpalette", label: "Choose a theme", tint: palette.controlTint) { appearance = true }
                    }
                    if currentPage != .settings {
                        headerIcon("gearshape", label: "Account settings", tint: palette.foreground) { push(.settings, in: tab) }
                    }
                }
                .padding(.horizontal, 12)
                .disabled(store.saving)
            }
            .padding(.vertical, 4)
            Rectangle().fill(palette.foreground.opacity(0.15)).frame(height: 1 / displayScale)
            if store.demo {
                HStack(spacing: 8) {
                    Text(store.t("Demo teaching ledger")).font(palette.font(12, .semibold))
                    Spacer(minLength: 0)
                    Button { Task { await store.beginSignIn(open: openURL) } } label: {
                        Label(store.t("Sign in"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .buttonStyle(WorkspaceOutlineButton(palette: palette, compact: true))
                    .accessibilityIdentifier("workspace-demo-sign-in")
                }
                .padding(.horizontal, 12).padding(.vertical, 4)
                Rectangle().fill(palette.border).frame(height: 1 / displayScale)
            }
        }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    private func headerIcon(_ icon: String, label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 19, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(store.t(label))
    }

    private func headerTitle(_ tab: WorkspaceTab) -> String {
        guard let route = paths[tab]?.last else { return tab.label }
        switch route {
        case .student: return "Students"
        case .teachingClass: return "Classes"
        case .statement: return "Statements"
        case .session, .lesson, .classHistory: return "Lessons"
        case .recordLesson, .recordStudentLesson: return "Record lesson"
        case .studentHistory(let kind, _): return kind.title
        case .settings: return "Account settings"
        case .appearance: return "Appearance"
        case .schedule: return "Upcoming lessons"
        case .onboarding: return "Get started"
        }
    }

    private func goBack(_ tab: WorkspaceTab) {
        if !(paths[tab] ?? []).isEmpty { paths[tab]?.removeLast() }
        else { selection = .dashboard }
        pendingBack = nil; store.hasUnsavedEdits = false
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(WorkspaceTab.allCases, id: \.self) { tab in
                let active = selection == tab
                Button {
                    if active { if !store.hasUnsavedEdits && !store.saving { paths[tab] = [] } }
                    else {
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
                    .background(active ? store.palette.accent : .clear, in: RoundedRectangle(cornerRadius: 11))
                }
                .buttonStyle(.plain)
                .disabled(store.saving)
                .accessibilityAddTraits(active ? .isSelected : [])
                .accessibilityIdentifier("workspace-tab-\(String(describing: tab))")
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .background(store.palette.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Divider() }
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

    @ViewBuilder private func destination(_ route: WorkspaceRoute) -> some View {
        switch route {
        case .student(let id): LedgerRecordDetail(kind: .students, id: id)
        case .teachingClass(let id): LedgerRecordDetail(kind: .classes, id: id)
        case .session(let id): LedgerRecordDetail(kind: .sessions, id: id)
        case .lesson(let id): LedgerRecordDetail(kind: .lessons, id: id)
        case .statement(let id): NativeStatementDetail(id: id)
        case let .studentHistory(kind, id):
            LedgerDirectory(kind, relation: id.isEmpty ? [:] : ["studentId": id]).navigationTitle(store.t(kind.title))
        case .classHistory(let id): LedgerDirectory(.sessions, relation: ["classId": id]).navigationTitle(store.t("Lessons"))
        case .recordStudentLesson(let id): LessonEditor(studentID: id)
        case let .recordLesson(classID, date, time):
            LessonEditor(classID: classID, proposedDate: date, proposedTime: time)
        case .schedule: NativeSchedule()
        case .settings: NativeSettings()
        case .appearance: NativeAppearance()
        case .onboarding: NativeOnboarding()
        }
    }

    private func push(_ route: WorkspaceRoute, in tab: WorkspaceTab) {
        paths[tab, default: []].append(route)
    }
}
