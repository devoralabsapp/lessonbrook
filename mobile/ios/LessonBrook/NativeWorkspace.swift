import SwiftUI

struct WorkspaceSnapshot: Decodable, Equatable {
    struct Summary: Decodable, Equatable {
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
    let schedule: Schedule?

    struct Schedule: Decodable, Equatable {
        let today: String
        let items: [Lesson]
        let recurring: [Lesson]?

        var upcoming: [Lesson] {
            Array((items + (recurring ?? [])).sorted {
                ($0.date, $0.time ?? "24:00", $0.id) < ($1.date, $1.time ?? "24:00", $1.id)
            }.prefix(8))
        }
    }

    struct Lesson: Decodable, Identifiable, Equatable {
        let id: String
        let kind: String
        let name: String?
        let date: String
        let time: String?

        var path: String {
            if kind == "recurring" {
                var url = URLComponents()
                url.path = "/app/lessons/new"
                url.queryItems = [
                    URLQueryItem(name: "classId", value: id), URLQueryItem(name: "date", value: date),
                    URLQueryItem(name: "time", value: time)
                ]
                return url.string ?? "/app/schedule"
            }
            return "/app/\(kind == "group" ? "lessons" : "sessions")/\(id)"
        }
    }
}

enum WorkspaceTab: Int, CaseIterable {
    case dashboard, students, classes, lessons, statements

    var label: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .students: return "Students"
        case .lessons: return "Lessons"
        case .statements: return "Statements"
        case .classes: return "Classes"
        }
    }

    var icon: String {
        switch self {
        case .dashboard: return "rectangle.grid.2x2"
        case .students: return "person.2"
        case .lessons: return "calendar"
        case .statements: return "doc.text"
        case .classes: return "building.2"
        }
    }

    var path: String? {
        switch self {
        case .students: return "/app/students"
        case .lessons: return "/app/sessions"
        case .statements: return "/app/statements"
        case .classes: return "/app/classes"
        default: return nil
        }
    }
}

struct WorkspacePalette {
    let background: Color
    let surface: Color
    let accent: Color
    let foreground: Color
    let onAccent: Color
    let controlTint: Color
    let dark: Bool
    let border: Color
    let yellow: Color
    let blue: Color
    let mint: Color
    let dashboardInk: Color
    let radius: CGFloat
    let outline: CGFloat
    let shadowOffset: CGFloat
    let fontDesign: Font.Design

    init(_ theme: String? = nil) {
        dark = theme == "afterhours-fm"
        switch theme {
        case "mono-os":
            background = Self.color(0xd9d9d9)
            surface = Self.color(0xffffff)
            accent = Self.color(0x111111)
            foreground = Self.color(0x111111)
            onAccent = Self.color(0xffffff)
            controlTint = Self.color(0x111111)
            border = Self.color(0x111111)
            radius = 7; outline = 1; shadowOffset = 3
            yellow = Self.color(0xffffff); blue = Self.color(0xffffff); mint = Self.color(0xffffff)
            dashboardInk = Self.color(0x111111); fontDesign = .monospaced
        case "chapter-desk":
            background = Self.color(0xf4e9d5)
            surface = Self.color(0xfff5e2)
            accent = Self.color(0xa34018)
            foreground = Self.color(0x29271f)
            onAccent = Self.color(0xffffff)
            controlTint = Self.color(0xa34018)
            border = Self.color(0x9d8c73)
            radius = 0; outline = 1; shadowOffset = 0
            yellow = Self.color(0xfff5e2); blue = Self.color(0xfff5e2); mint = Self.color(0xfff5e2)
            dashboardInk = Self.color(0x29271f); fontDesign = .serif
        case "afterhours-fm":
            background = Self.color(0x101010)
            surface = Self.color(0x1d1d1d)
            accent = Self.color(0xf7d449)
            foreground = Self.color(0xfaf9f3)
            onAccent = Self.color(0x101010)
            controlTint = Self.color(0xf7d449)
            border = Self.color(0x555551)
            radius = 16; outline = 1; shadowOffset = 0
            yellow = Self.color(0xf7d449); blue = Self.color(0xdbabdf); mint = Self.color(0x71d6c8)
            dashboardInk = Self.color(0x211b18); fontDesign = .default
        case "margin-notes":
            background = Self.color(0xf0e9df)
            surface = Self.color(0xfffcf5)
            accent = Self.color(0x713346)
            foreground = Self.color(0x30262b)
            onAccent = Self.color(0xffffff)
            controlTint = Self.color(0x713346)
            border = Self.color(0x9c8790)
            radius = 2; outline = 1; shadowOffset = 4
            yellow = Self.color(0xf2d978); blue = Self.color(0xded8eb); mint = Self.color(0xc5d9cd)
            dashboardInk = Self.color(0x30262b); fontDesign = .serif
        case "sticker-sprint":
            background = Self.color(0xfff8ec)
            surface = Self.color(0xfffaf1)
            accent = Self.color(0x503298)
            foreground = Self.color(0x111111)
            onAccent = Self.color(0xffffff)
            controlTint = Self.color(0x503298)
            border = Self.color(0x211b18)
            radius = 16; outline = 1; shadowOffset = 4
            yellow = Self.color(0xffd34e); blue = Self.color(0xded2f9); mint = Self.color(0xbdebd9)
            dashboardInk = Self.color(0x111111); fontDesign = .rounded
        default:
            background = Self.color(0xfff6e6)
            surface = Self.color(0xfffdf7)
            accent = Self.color(0xffd02c)
            foreground = Self.color(0x211f1b)
            onAccent = Self.color(0x211f1b)
            controlTint = Self.color(0x211f1b)
            border = Self.color(0x211f1b)
            radius = 20; outline = 2; shadowOffset = 4
            yellow = Self.color(0xffd02c); blue = Self.color(0x79c8ff); mint = Self.color(0x83e5b0)
            dashboardInk = Self.color(0x211f1b); fontDesign = .rounded
        }
    }

    var scheduleTones: [Color] {
        switch fontDesign {
        case .monospaced:
            return [surface, background]
        case .serif where radius == 0:
            return [surface, background, Self.color(0xf1dfc2)]
        default:
            return [blue, mint, yellow]
        }
    }

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
    let theme: String?
    let open: (String) -> Void
    let refresh: () async -> Void

    private var palette: WorkspacePalette { WorkspacePalette(theme ?? snapshot.theme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(format: t("Hello, %@"), snapshot.displayName))
                    .font(.system(.title2, design: palette.fontDesign).bold())
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                tuition
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
                if let schedule = snapshot.schedule { scheduleView(schedule) }
                if snapshot.needsOnboarding {
                    Button { open("/onboarding") } label: {
                        Label(t("Get started"), systemImage: "list.bullet.clipboard")
                            .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                    .tint(palette.controlTint)
                }
            }
            .frame(maxWidth: 640)
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await refresh() }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    private var tuition: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(t("Outstanding tuition"), systemImage: "doc.text")
                .font(.system(.subheadline, design: palette.fontDesign).weight(.semibold))
            Text(money(snapshot.summary.outstandingVnd))
                .font(.system(.largeTitle, design: palette.fontDesign).bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .foregroundStyle(palette.dashboardInk)
        .padding(14)
        .modifier(WorkspacePanel(palette: palette, fill: palette.yellow))
    }

    private func scheduleView(_ schedule: WorkspaceSnapshot.Schedule) -> some View {
        let items = schedule.upcoming
        return VStack(alignment: .leading, spacing: 9) {
            Text(t("Upcoming lessons")).font(.system(.title2, design: palette.fontDesign).bold()).accessibilityAddTraits(.isHeader)
            if items.isEmpty {
                Text(t("No planned lessons in the next seven days."))
                    .font(.system(.subheadline, design: palette.fontDesign)).foregroundStyle(palette.foreground)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.path) { index, lesson in
                        Button { open(lesson.path) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "calendar")
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(lesson.name ?? t("Group lesson")).font(.system(.subheadline, design: palette.fontDesign).weight(.semibold))
                                    Text("\(dayLabel(lesson.date, today: schedule.today)) · \(lesson.time ?? t("Time not set"))")
                                        .font(.system(.footnote, design: palette.fontDesign))
                                    if lesson.kind == "recurring" { Text(t("Weekly")).font(.system(.caption, design: palette.fontDesign)) }
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(.footnote, design: palette.fontDesign)).accessibilityHidden(true)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(minHeight: 46)
                            .foregroundStyle(palette.dashboardInk)
                            .background(palette.scheduleTones[index % palette.scheduleTones.count])
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if index < items.count - 1 { Divider().overlay(palette.border.opacity(0.4)) }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: palette.radius))
                .modifier(WorkspacePanel(palette: palette, fill: palette.surface))
                Button(t("View full schedule")) { open("/app/schedule") }
                    .font(.system(.subheadline, design: palette.fontDesign).weight(.semibold))
                    .tint(palette.controlTint)
            }
        }
    }

    private func dayLabel(_ date: String, today: String) -> String {
        if date == today { return t("Today") }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let day = formatter.date(from: date) else { return date }
        formatter.locale = Locale(identifier: snapshot.locale == "vi" ? "vi_VN" : "en_US")
        formatter.dateStyle = .medium
        return formatter.string(from: day)
    }

    private var unbilled: some View {
        metric("Unbilled lessons", value: money(snapshot.summary.unbilledVnd), icon: "calendar.badge.clock",
               detail: String(format: t("%@ lessons"), number(snapshot.summary.unbilledCount)), fill: palette.blue)
    }

    private var received: some View {
        metric("Received this month", value: money(snapshot.summary.receivedMonthVnd), icon: "arrow.down.circle", fill: palette.mint)
    }

    private func metric(_ title: String, value: String, icon: String, detail: String? = nil, fill: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).foregroundStyle(fill == nil ? palette.controlTint : palette.dashboardInk).accessibilityHidden(true)
            Text(t(title)).font(.system(.footnote, design: palette.fontDesign).weight(.medium)).fixedSize(horizontal: false, vertical: true)
            Text(value).font(.system(.headline, design: palette.fontDesign).monospacedDigit()).fixedSize(horizontal: false, vertical: true)
            if let detail { Text(detail).font(.system(.caption, design: palette.fontDesign)) }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(12)
        .foregroundStyle(fill == nil ? palette.foreground : palette.dashboardInk)
        .modifier(WorkspacePanel(palette: palette, fill: fill ?? palette.surface))
        .accessibilityElement(children: .combine)
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: snapshot.locale) }

    private func number(_ value: Int) -> String {
        value.formatted(.number.locale(Locale(identifier: snapshot.locale == "vi" ? "vi_VN" : "en_US")))
    }

    private func money(_ value: Int) -> String { "\(number(value)) ₫" }
}

// Shared tokens for native cards and buttons, matching the web theme surfaces.
struct WorkspacePanel: ViewModifier {
    let palette: WorkspacePalette
    let fill: Color
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: palette.radius)
        content
            .background(fill, in: shape)
            .overlay(shape.stroke(palette.border, lineWidth: palette.outline))
            .background(shape.fill(palette.border).offset(x: palette.shadowOffset, y: palette.shadowOffset))
    }
}

struct WorkspacePrimaryButton: ButtonStyle {
    let palette: WorkspacePalette
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: palette.fontDesign).weight(.semibold))
            .foregroundStyle(palette.onAccent)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .modifier(WorkspacePanel(palette: palette, fill: palette.accent))
            .offset(y: configuration.isPressed ? 2 : 0)
    }
}

struct NativeWelcome: View {
    let locale: String
    let available: Bool?
    let expired: Bool
    let checkFailed: Bool
    let signIn: () -> Void
    let demo: () -> Void
    let retry: () -> Void
    let changeLanguage: (String) -> Void
    let help: () -> Void
    private let palette = WorkspacePalette()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: "checkmark.rectangle")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(palette.onAccent)
                    .frame(width: 66, height: 66)
                    .background(palette.accent, in: RoundedRectangle(cornerRadius: 19))
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
                    .buttonStyle(WorkspacePrimaryButton(palette: palette))
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
                Button(action: demo) {
                    Label(t("View demo"), systemImage: "play.rectangle")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.bordered)
                .tint(palette.controlTint)
                Text(t("Explore with sample data. No account needed."))
                    .font(.footnote)
                    .foregroundStyle(palette.foreground)
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
                .tint(palette.controlTint)
                .padding(.top, 8)
            }
            .frame(maxWidth: 420, alignment: .leading)
            .padding(20)
            .padding(.top, 24)
            .frame(maxWidth: .infinity)
        }
        .background(palette.background)
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: locale) }
}
