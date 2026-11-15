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
    let recordAccent: Color
    let retroRows: Bool
    let radius: CGFloat
    let outline: CGFloat
    let shadowOffset: CGFloat
    let fontDesign: Font.Design

    init(_ theme: String? = nil) {
        dark = theme == "afterhours-fm"
        retroRows = theme == nil || theme == "playful-retro"
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
            recordAccent = Self.color(0xe7e7e7)
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
            recordAccent = Self.color(0xefdcac)
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
            recordAccent = Self.color(0x323019)
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
            recordAccent = Self.color(0xead5dd)
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
            recordAccent = Self.color(0xbdebd9)
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
            recordAccent = Self.color(0xffd02c)
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
    @Environment(\.dynamicTypeSize) private var textSize

    private var palette: WorkspacePalette { WorkspacePalette(theme ?? snapshot.theme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(t("Have a good teaching day."))
                    .font(.system(.title2, design: palette.fontDesign).bold())
                    .accessibilityAddTraits(.isHeader)
                metric("Outstanding tuition", value: money(snapshot.summary.outstandingVnd),
                       size: .largeTitle, fill: palette.yellow)
                if textSize.isAccessibilitySize {
                    VStack(spacing: 12) {
                        unbilled
                        received
                    }
                } else {
                    Grid(horizontalSpacing: 12) {
                        GridRow(alignment: .top) {
                            unbilled
                            received
                        }
                    }
                }
                metric("Active students", value: number(snapshot.summary.activeStudents), size: .title3)
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
            .padding(.horizontal, 12)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await refresh() }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    private func scheduleView(_ schedule: WorkspaceSnapshot.Schedule) -> some View {
        let items = schedule.upcoming
        return VStack(alignment: .leading, spacing: 0) {
            Text(t("Upcoming lessons"))
                .font(.system(.title3, design: palette.fontDesign).bold())
                .accessibilityAddTraits(.isHeader)
                .padding(12)
            Divider().overlay(palette.border)
            if items.isEmpty {
                Text(t("No planned lessons in the schedule."))
                    .font(.system(.subheadline, design: palette.fontDesign))
                    .padding(12)
            } else {
                ForEach(Array(items.enumerated()), id: \.element.path) { index, lesson in
                    scheduleRow(lesson, today: schedule.today, index: index)
                    Divider().overlay(palette.border)
                }
                Button(t("View full schedule")) { open("/app/schedule") }
                    .font(.system(.subheadline, design: palette.fontDesign).weight(.semibold))
                    .underline()
                    .tint(palette.controlTint)
                    .padding(12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: palette.radius))
        .modifier(WorkspacePanel(palette: palette, fill: palette.surface))
    }

    private func scheduleRow(_ lesson: WorkspaceSnapshot.Lesson, today: String, index: Int) -> some View {
        let name = lesson.name ?? t("Group lesson")
        let tone = index.isMultiple(of: 2) ? palette.blue : palette.mint
        let frame = RoundedRectangle(cornerRadius: min(palette.radius, 14))
        let recurrence = lesson.kind == "recurring" ? " · \(t("Weekly"))" : ""
        return Button { open(lesson.path) } label: {
            HStack(spacing: 9) {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(.subheadline, design: palette.fontDesign).weight(.medium))
                    .frame(width: 40, height: 40)
                    .background(palette.recordAccent, in: RoundedRectangle(cornerRadius: 3))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name).font(.system(.body, design: palette.fontDesign).bold())
                    Text("\(dayLabel(lesson.date, today: today)) · \(lesson.time ?? t("Time not set"))\(recurrence)")
                        .font(.system(.footnote, design: palette.fontDesign))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .foregroundStyle(palette.foreground)
            .background(palette.recordAccent.opacity(0.7), in: frame)
            .background(palette.surface, in: frame)
            .overlay(frame.strokeBorder(palette.controlTint, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(12)
        .background {
            if palette.retroRows {
                Rectangle().fill(tone.opacity(0.3)).overlay(alignment: .leading) {
                    Rectangle().fill(tone).frame(width: 5)
                }
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
        formatter.locale = Locale(identifier: snapshot.locale == "vi" ? "vi_VN" : "en_GB")
        formatter.setLocalizedDateFormatFromTemplate("d MMM yyyy")
        return formatter.string(from: day)
    }

    private var unbilled: some View {
        metric("Lessons ready for a statement", value: money(snapshot.summary.unbilledVnd),
               fill: palette.blue, compact: true)
    }

    private var received: some View {
        metric("Received this month", value: money(snapshot.summary.receivedMonthVnd),
               fill: palette.mint, compact: true)
    }

    private func metric(_ title: String, value: String, size: Font.TextStyle = .body,
                        fill: Color? = nil, compact: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(t(title)).font(.system(compact ? .footnote : .subheadline, design: palette.fontDesign))
                .fixedSize(horizontal: false, vertical: true)
            Text(value).font(.system(size, design: palette.fontDesign).bold().monospacedDigit())
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: compact && !textSize.isAccessibilitySize ? 68 : nil,
               alignment: .topLeading)
        .padding(12)
        .foregroundStyle(fill == nil ? palette.foreground : palette.dashboardInk)
        .modifier(WorkspacePanel(palette: palette, fill: fill ?? palette.surface))
        .accessibilityElement(children: .combine)
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: snapshot.locale) }

    private func number(_ value: Int) -> String {
        value.formatted(.number.locale(Locale(identifier: snapshot.locale == "vi" ? "vi_VN" : "en_GB")))
    }

    private func money(_ value: Int) -> String {
        snapshot.locale == "vi" ? "\(number(value))\u{00A0}₫" : "₫\(number(value))"
    }
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

struct WelcomeButtonStyle: ButtonStyle {
    let palette: WorkspacePalette
    let primary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: palette.fontDesign).bold())
            .foregroundStyle(primary ? palette.onAccent : palette.foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(minHeight: 48)
            .modifier(WorkspacePanel(palette: palette, fill: primary ? palette.accent : palette.surface))
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
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
            VStack(spacing: 22) {
                HStack {
                    Text("LessonBrook")
                        .font(.system(.headline, design: palette.fontDesign).bold())
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 12)
                    Menu {
                        Button("English") { changeLanguage("en") }
                        Button("Tiếng Việt") { changeLanguage("vi") }
                    } label: {
                        Label(locale == "vi" ? "Tiếng Việt" : "English", systemImage: "globe")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                            .modifier(WorkspacePanel(palette: palette, fill: palette.surface))
                    }
                    .tint(palette.controlTint)
                }

                VStack(spacing: 10) {
                    ledgerMark
                    Text(t("Sign in"))
                        .font(.system(.largeTitle, design: palette.fontDesign).bold())
                        .accessibilityAddTraits(.isHeader)
                    Text(t("Your lessons and tuition in one place."))
                        .font(.system(.subheadline, design: palette.fontDesign))
                    if expired {
                        Text(t("Your session expired. Sign in again."))
                            .font(.footnote)
                            .padding(9)
                            .frame(maxWidth: .infinity)
                            .background(palette.yellow.opacity(0.32), in: RoundedRectangle(cornerRadius: 10))
                    }
                    signInAction
                        .padding(.top, 8)
                }
                .multilineTextAlignment(.center)
                .padding(18)
                .frame(maxWidth: .infinity)
                .modifier(WorkspacePanel(palette: palette, fill: palette.surface))

                VStack(spacing: 6) {
                    Button(action: demo) {
                        welcomeLabel(t("View demo"), icon: "play.rectangle")
                    }
                    .buttonStyle(WelcomeButtonStyle(palette: palette, primary: false))
                    Text(t("Explore with sample data. No account needed."))
                        .font(.system(.footnote, design: palette.fontDesign))
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }

                Button(action: help) {
                    Text(t("Help & support"))
                        .underline()
                        .font(.system(.subheadline, design: palette.fontDesign))
                        .frame(minHeight: 44)
                }
                .tint(palette.controlTint)
            }
            .frame(maxWidth: 400)
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity)
        }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    private var ledgerMark: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(palette.blue)
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(palette.border, lineWidth: 2))
                .frame(width: 58, height: 66)
                .rotationEffect(.degrees(11))
                .offset(x: 10, y: -2)
            Image(systemName: "checkmark.rectangle")
                .font(.system(size: 34, weight: .semibold))
                .frame(width: 58, height: 66)
                .modifier(WorkspacePanel(palette: palette, fill: palette.yellow))
                .rotationEffect(.degrees(-7))
                .offset(x: -6, y: 2)
        }
        .frame(height: 86)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var signInAction: some View {
        if available == true {
            Button(action: signIn) {
                welcomeLabel(t("Continue with Google"), icon: nil)
            }
            .buttonStyle(WelcomeButtonStyle(palette: palette, primary: true))
        } else if checkFailed || available == false {
            Text(t(checkFailed ? "Check your connection and try again." : "Sign-in is currently unavailable."))
                .font(.footnote)
            Button(t("Try again"), action: retry)
                .buttonStyle(WelcomeButtonStyle(palette: palette, primary: false))
        } else {
            ProgressView()
                .tint(palette.controlTint)
                .frame(maxWidth: .infinity, minHeight: 48)
                .accessibilityLabel(t("Checking sign-in availability"))
        }
    }

    private func welcomeLabel(_ title: String, icon: String?) -> some View {
        HStack(spacing: 10) {
            Group {
                if let icon { Image(systemName: icon) }
                else { Text("G").font(.headline.bold()) }
            }
            .frame(width: 20)
            .accessibilityHidden(true)
            Text(title).frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.right").font(.footnote.bold()).accessibilityHidden(true)
        }
    }

    private func t(_ key: String) -> String { workspaceText(key, locale: locale) }
}

/// Compact themed primary actions with explicit contrast in every palette.
struct WorkspaceActionButton: ButtonStyle {
    let palette: WorkspacePalette
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius)
        configuration.label.font(palette.font(15, .heavy))
            .foregroundStyle(palette.onAccent)
            .padding(.horizontal, 12).padding(.vertical, 9).frame(minHeight: 44)
            .background(palette.accent, in: shape)
            .overlay(shape.stroke(palette.border, lineWidth: palette.outline))
            .background(shape.fill(palette.border).offset(x: palette.shadowOffset, y: palette.shadowOffset))
            .opacity(enabled ? 1 : 0.45)
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
    }
}
