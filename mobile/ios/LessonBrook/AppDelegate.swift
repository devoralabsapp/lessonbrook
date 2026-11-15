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
    @Environment(\.openURL) private var openURL
    private let logger = Logger(subsystem: "tech.devoralabs.lessonbrook", category: "performance")

    var body: some View {
        TabView(selection: $selection) {
            ForEach(WorkspaceTab.allCases, id: \.self) { tab in
                NavigationStack(path: Binding(get: { paths[tab] ?? [] }, set: { paths[tab] = $0 })) {
                    screen(tab)
                        .navigationTitle(store.t(tab.label))
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbarBackground(store.palette.surface, for: .navigationBar)
                        .toolbarBackground(.visible, for: .navigationBar)
                        .toolbar {
                            ToolbarItemGroup(placement: .navigationBarTrailing) {
                                Button { push(.appearance, in: tab) } label: {
                                    Image(systemName: "paintpalette")
                                }.accessibilityLabel(store.t("Choose a theme"))
                                Button { push(.settings, in: tab) } label: {
                                    Image(systemName: "gearshape")
                                }.accessibilityLabel(store.t("Account settings"))
                            }
                        }
                        .navigationDestination(for: WorkspaceRoute.self, destination: destination)
                }
                .toolbar(.hidden, for: .tabBar)
                .tag(tab)
            }
        }
        .tint(store.palette.controlTint)
        .onChange(of: selection) { tab in
            if tab == .dashboard { Task { await store.refreshDashboard() } }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { tabs }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 60_000_000_000) } catch { return }
                await store.refreshDashboard()
            }
        }
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
                        Image(systemName: tab.icon).font(.body)
                        Text(store.t(tab.label)).font(.caption2.weight(active ? .bold : .medium))
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(active ? store.palette.onAccent : store.palette.foreground)
                    .frame(maxWidth: .infinity, minHeight: 46)
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
                if store.demo {
                    HStack {
                        Text(store.t("Demo teaching ledger"))
                        Spacer()
                        Button(store.t("Sign in")) { Task { await store.beginSignIn(open: openURL) } }
                            .buttonStyle(WorkspaceActionButton(palette: store.palette))
                    }
                    .padding(12)
                    .background(store.palette.surface)
                }
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
