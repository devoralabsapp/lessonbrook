import SwiftUI

struct WorkspaceSnapshot: Decodable {
    struct Summary: Decodable {
        let activeStudents: Int
        let outstandingVnd: Int
        let overdueVnd: Int
        let receivedMonthVnd: Int
        let unbilledCount: Int
        let unbilledVnd: Int
    }

    let summary: Summary
    let theme: String
    let displayName: String
    let needsOnboarding: Bool
    let locale: String
}

enum WorkspaceTab: Int, CaseIterable {
    case today, students, lessons, tuition, more

    var label: String {
        switch self {
        case .today: return "Today"
        case .students: return "Students"
        case .lessons: return "Lessons"
        case .tuition: return "Tuition"
        case .more: return "More"
        }
    }

    var icon: String {
        switch self {
        case .today: return "rectangle.grid.2x2"
        case .students: return "person.2"
        case .lessons: return "calendar"
        case .tuition: return "doc.text"
        case .more: return "ellipsis.circle"
        }
    }

    var path: String? {
        switch self {
        case .students: return "/app/students"
        case .lessons: return "/app/sessions"
        case .tuition: return "/app/statements"
        default: return nil
        }
    }
}

struct WorkspacePalette {
    let background: Color
    let surface: Color
    let accent: Color
    let dark: Bool

    init(_ theme: String) {
        let colors: (UInt32, UInt32, UInt32, Bool)
        switch theme {
        case "modern": colors = (0xedf3fb, 0xffffff, 0x2858a0, false)
        case "vintage": colors = (0xf5eee1, 0xfffcf5, 0x805332, false)
        case "art": colors = (0xfaf0f6, 0xfffcff, 0x854078, false)
        case "ocean": colors = (0xedf7f8, 0xffffff, 0x176676, false)
        case "command-line": colors = (0x000000, 0x151515, 0x74e6a1, true)
        case "visual-code": colors = (0x1e1e1e, 0x252526, 0x75beff, true)
        case "playful-retro": colors = (0xfff6e6, 0xfffdf8, 0x734626, false)
        default: colors = (0xf7f8f3, 0xffffff, 0x296447, false)
        }
        background = Self.color(colors.0)
        surface = Self.color(colors.1)
        accent = Self.color(colors.2)
        dark = colors.3
    }

    var foreground: Color { dark ? .white : Self.color(0x192b23) }
    var onAccent: Color { dark ? .black : .white }

    private static func color(_ rgb: UInt32) -> Color {
        Color(
            red: Double((rgb >> 16) & 255) / 255,
            green: Double((rgb >> 8) & 255) / 255,
            blue: Double(rgb & 255) / 255
        )
    }
}

func workspaceText(_ key: String, locale: String) -> String {
    let path = Bundle.main.path(forResource: locale, ofType: "lproj")
    return path.flatMap(Bundle.init(path:))?.localizedString(forKey: key, value: key, table: nil) ?? key
}

struct NativeDashboard: View {
    let snapshot: WorkspaceSnapshot
    let open: (String) -> Void
    let refresh: () async -> Void

    private var palette: WorkspacePalette { WorkspacePalette(snapshot.theme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(String(format: t("Hello, %@"), snapshot.displayName))
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 8) {
                    Label(t("Outstanding tuition"), systemImage: "doc.text")
                        .font(.subheadline.weight(.semibold))
                    Text(money(snapshot.summary.outstandingVnd))
                        .font(.system(.largeTitle, design: .rounded).bold())
                        .monospacedDigit()
                    if snapshot.summary.overdueVnd > 0 {
                        Text(String(format: t("%@ overdue"), money(snapshot.summary.overdueVnd)))
                            .font(.footnote)
                    }
                }
                .foregroundStyle(palette.onAccent)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .background(palette.accent, in: RoundedRectangle(cornerRadius: 22))

                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 12) {
                        unbilled
                        received
                    }
                    VStack(spacing: 12) {
                        unbilled
                        received
                    }
                }
                metric("Active students", value: number(snapshot.summary.activeStudents), icon: "person.2")
                Button { open("/app/lessons/new") } label: {
                    Label(t("Record a lesson"), systemImage: "plus.circle")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.borderedProminent)
                .tint(palette.accent)
                .foregroundStyle(palette.onAccent)
                if snapshot.needsOnboarding {
                    Button { open("/onboarding") } label: {
                        Label(t("Get started"), systemImage: "list.bullet.clipboard")
                            .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                    .tint(palette.accent)
                }
            }
            .frame(maxWidth: 640)
            .padding(20)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await refresh() }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    private var unbilled: some View {
        metric("Unbilled lessons", value: money(snapshot.summary.unbilledVnd), icon: "calendar.badge.clock",
               detail: String(format: t("%@ lessons"), number(snapshot.summary.unbilledCount)))
    }

    private var received: some View {
        metric("Received this month", value: money(snapshot.summary.receivedMonthVnd), icon: "arrow.down.circle")
    }

    private func metric(_ title: String, value: String, icon: String, detail: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).foregroundStyle(palette.accent).accessibilityHidden(true)
            Text(t(title)).font(.footnote.weight(.medium)).fixedSize(horizontal: false, vertical: true)
            Text(value).font(.headline.monospacedDigit()).fixedSize(horizontal: false, vertical: true)
            if let detail { Text(detail).font(.caption) }
        }
        .frame(maxWidth: .infinity, minHeight: 94, alignment: .topLeading)
        .padding(15)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 17))
        .accessibilityElement(children: .combine)
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: snapshot.locale) }

    private func number(_ value: Int) -> String {
        value.formatted(.number.locale(Locale(identifier: snapshot.locale == "vi" ? "vi_VN" : "en_US")))
    }

    private func money(_ value: Int) -> String { "\(number(value)) ₫" }
}

struct NativeWelcome: View {
    let locale: String
    let available: Bool?
    let expired: Bool
    let checkFailed: Bool
    let signIn: () -> Void
    let retry: () -> Void
    let changeLanguage: (String) -> Void
    let help: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: "checkmark.rectangle")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 66, height: 66)
                    .background(WorkspacePalette("natura").accent, in: RoundedRectangle(cornerRadius: 19))
                    .accessibilityHidden(true)
                Text("LessonBrook").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                Text(t("Your lessons and tuition in one place.")).foregroundStyle(.secondary)
                if expired { Text(t("Your session expired. Sign in again.")).font(.footnote) }
                if available == true {
                    Button(action: signIn) {
                        Text(t("Continue with Google"))
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity, minHeight: 43)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(WorkspacePalette("natura").accent)
                    .padding(.top, 8)
                } else if checkFailed {
                    Text(t("Check your connection and try again.")).font(.footnote)
                    Button(t("Try again"), action: retry).buttonStyle(.bordered)
                } else if available == false {
                    Text(t("Sign-in is currently unavailable.")).font(.footnote)
                    Button(t("Try again"), action: retry).buttonStyle(.bordered)
                } else {
                    ProgressView().accessibilityLabel(t("Checking sign-in availability"))
                }
                HStack {
                    Menu {
                        Button("English") { changeLanguage("en") }
                        Button("Tiếng Việt") { changeLanguage("vi") }
                    } label: {
                        Label(locale == "vi" ? "Tiếng Việt" : "English", systemImage: "globe")
                    }
                    Spacer()
                    Button(t("Help & support"), action: help)
                }
                .font(.footnote.weight(.semibold))
                .tint(WorkspacePalette("natura").accent)
                .padding(.top, 8)
            }
            .frame(maxWidth: 420, alignment: .leading)
            .padding(26)
            .padding(.top, 56)
            .frame(maxWidth: .infinity)
        }
        .background(WorkspacePalette("natura").background)
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: locale) }
}

struct NativeMore: View {
    let locale: String
    let palette: WorkspacePalette
    let open: (String) -> Void

    var body: some View {
        List {
            row("Classes", icon: "person.3", path: "/app/classes")
            row("Account settings", icon: "gearshape", path: "/app/settings")
            row("Help & support", icon: "questionmark.circle", path: "/help")
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(palette.background)
        .tint(palette.accent)
        .environment(\.colorScheme, palette.dark ? .dark : .light)
    }

    private func row(_ label: String, icon: String, path: String) -> some View {
        Button { open(path) } label: {
            HStack {
                Label(workspaceText(label, locale: locale), systemImage: icon)
                Spacer()
                Image(systemName: "chevron.right").font(.footnote)
                    .foregroundStyle(.secondary).accessibilityHidden(true)
            }
            .frame(minHeight: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(palette.surface)
    }
}
