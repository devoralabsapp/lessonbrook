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
        let through: String?
        let items: [Lesson]
        let recurring: [Lesson]?

        var orderedLessons: [Lesson] {
            (items + (recurring ?? [])).sorted {
                ($0.date, $0.time ?? "24:00", $0.id) < ($1.date, $1.time ?? "24:00", $1.id)
            }
        }
        var upcoming: [Lesson] { Array(orderedLessons.prefix(8)) }
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
    let calendarSelection: Color
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
            calendarSelection = Self.color(0xe2ecf3)
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
            calendarSelection = Self.color(0xffd498)
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
            calendarSelection = Self.color(0xf7d449)
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
            calendarSelection = Self.color(0xffcbdc)
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
            calendarSelection = Self.color(0xded2ff)
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
            calendarSelection = Self.color(0xffdf54)
        }
    }

    static func color(_ rgb: UInt32) -> Color {
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
                VStack(alignment: .leading, spacing: 7) {
                    Text(t("Today").uppercased() + " · " + dayLabel(LedgerDate.today).uppercased())
                        .font(palette.font(11, .semibold)).tracking(1.8).foregroundStyle(palette.secondaryInk)
                    Text(t("Have a good teaching day."))
                        .font(palette.font(25, .heavy)).accessibilityAddTraits(.isHeader)
                    Text(t("Each lesson recorded is one less thing to remember at month-end."))
                        .font(palette.font(15)).foregroundStyle(palette.secondaryInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                metric("Outstanding tuition", value: money(snapshot.summary.outstandingVnd),
                       size: 29, fill: palette.yellow, icon: "note.text",
                       caption: "Unpaid balance on all issued statements")
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
                metric("Active students", value: number(snapshot.summary.activeStudents), size: 20)
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
                .font(palette.font(17, .heavy))
                .accessibilityAddTraits(.isHeader)
                .padding(12)
            Divider().overlay(palette.border)
            if items.isEmpty {
                Text(t("No planned lessons in the schedule."))
                    .font(palette.font(14))
                    .padding(12)
            } else {
                ForEach(Array(items.enumerated()), id: \.element.path) { index, lesson in
                    scheduleRow(lesson, today: schedule.today, index: index)
                    Divider().overlay(palette.border)
                }
                Button(t("View full schedule")) { open("/app/schedule") }
                    .font(palette.font(14, .semibold))
                    .buttonStyle(.plain)
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
        let date = lesson.date == today ? t("Today") : dayLabel(lesson.date)
        let time = lesson.time ?? t("Time not set")
        let recurrence = lesson.kind == "recurring" ? " · " + t("Weekly") : ""
        return Button { open(lesson.path) } label: {
            WorkspaceScheduleRow(
                title: lesson.name ?? t("Group lesson"),
                details: date + " · " + time + recurrence,
                palette: palette,
                index: index
            )
        }
        .buttonStyle(.plain)
    }

    private func dayLabel(_ date: String) -> String {
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
               fill: palette.blue, icon: "calendar", compact: true)
    }

    private var received: some View {
        metric("Received this month", value: money(snapshot.summary.receivedMonthVnd),
               fill: palette.mint, icon: "note.text", compact: true)
    }

    private func metric(_ title: String, value: String, size: CGFloat = 17,
                        fill: Color? = nil, icon: String? = nil, caption: String? = nil,
                        compact: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 5) {
                Text(t(title)).font(palette.font(13, compact ? .semibold : .regular))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let icon {
                    Image(systemName: icon).font(.system(size: 14)).accessibilityHidden(true)
                }
            }
            Text(value).font(palette.font(size, .bold).monospacedDigit())
                .fixedSize(horizontal: false, vertical: true)
            if let caption {
                Text(t(caption)).font(palette.font(12)).fixedSize(horizontal: false, vertical: true)
            }
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
    var cornerRadius: CGFloat? = nil

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius ?? palette.radius)
        content
            .background(fill, in: shape)
            .overlay(shape.stroke(palette.border, lineWidth: palette.outline))
            .background(shape.fill(palette.border).offset(x: palette.shadowOffset, y: palette.shadowOffset))
    }
}

struct WorkspaceBrand: View {
    let palette: WorkspacePalette
    var subtitle: String? = nil
    private var compact: Bool { subtitle == nil }

    var body: some View {
        HStack(spacing: 8) {
            NotebookMark()
                .stroke(style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                .foregroundStyle(palette.dark ? palette.onAccent : palette.surface)
                .frame(width: compact ? 17 : 21, height: compact ? 17 : 21)
                .frame(width: compact ? 31 : 40, height: compact ? 31 : 40)
                .background(palette.dark ? palette.accent : palette.foreground, in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("LessonBrook\(Text(".").foregroundColor(WorkspacePalette.color(0xacb77f)))")
                    .font(palette.font(compact ? 18 : 20, .heavy))
                    .lineLimit(1).minimumScaleFactor(0.75)
                if let subtitle { Text(subtitle).font(palette.font(11)) }
            }
        }
    }
}

private struct NotebookMark: Shape {
    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: x * rect.width / 24, y: y * rect.height / 24)
        }
        var drawing = Path()
        drawing.move(to: point(13, 2))
        drawing.addLine(to: point(6, 2))
        drawing.addQuadCurve(to: point(4, 4), control: point(4, 2))
        drawing.addLine(to: point(4, 20))
        drawing.addQuadCurve(to: point(6, 22), control: point(4, 22))
        drawing.addLine(to: point(18, 22))
        drawing.addQuadCurve(to: point(20, 20), control: point(20, 22))
        drawing.addLine(to: point(20, 13))
        for y: CGFloat in [6, 10, 14, 18] {
            drawing.move(to: point(2, y))
            drawing.addLine(to: point(6, y))
        }
        drawing.move(to: point(21.5, 5.5))
        drawing.addQuadCurve(to: point(18.5, 2.5), control: point(22.5, 1.5))
        drawing.addLines([point(18.5, 2.5), point(13, 8), point(12, 12), point(16, 11), point(21.5, 5.5)])
        return drawing
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
            VStack(alignment: .leading, spacing: 20) {
                WorkspaceBrand(palette: palette, subtitle: t("Lesson & tuition ledger").uppercased())
                    .accessibilityElement(children: .combine)
                WorkspaceChoice(label: t("Language"), selection: Binding(get: { locale }, set: changeLanguage),
                                options: [("en", "English"), ("vi", "Tiếng Việt")],
                                compact: true, leadingIcon: "globe")
                    .frame(width: 132)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.top, 12)
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("A LIGHTER WAY TO KEEP RECORDS")).font(palette.font(12, .semibold)).tracking(1.5)
                    Text(t("Welcome.")).font(palette.font(37, .heavy)).accessibilityAddTraits(.isHeader)
                    Text(t("Sign in to open your lesson ledger. Students do not need an account."))
                        .font(palette.font(16)).foregroundStyle(palette.secondaryInk).lineSpacing(4)
                }
                if expired {
                    Text(t("Your session expired. Sign in again."))
                        .font(palette.font(14))
                        .padding(9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.yellow.opacity(0.32), in: RoundedRectangle(cornerRadius: 10))
                }
                signInAction
                Button(action: demo) {
                    welcomeLabel(t("View demo"), icon: "play.rectangle")
                }
                .buttonStyle(WorkspaceActionButton(palette: palette))
                Text(t("Explore with sample data. No account needed."))
                    .font(palette.font(13)).foregroundStyle(palette.secondaryInk)
                Divider().overlay(palette.border)
                Label {
                    Text(t("Your lesson data belongs to your account. Each lesson keeps its own price. An internet connection is required to save changes."))
                        .fixedSize(horizontal: false, vertical: true)
                } icon: { Image(systemName: "checkmark.shield") }
                    .font(palette.font(13)).foregroundStyle(palette.secondaryInk)
                Button(action: help) {
                    Text(t("Help & support")).underline().font(palette.font(14))
                        .frame(minHeight: 44)
                }.buttonStyle(.plain)
            }
            .frame(maxWidth: 400, alignment: .leading)
            .padding(.horizontal, 24).padding(.vertical, 25)
            .frame(maxWidth: .infinity)
        }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    @ViewBuilder
    private var signInAction: some View {
        if available == true {
            Button(action: signIn) {
                welcomeLabel(t("Continue with Google"), icon: nil)
            }
            .buttonStyle(WorkspaceOutlineButton(palette: palette))
        } else if checkFailed || available == false {
            Text(t(checkFailed ? "Check your connection and try again." : "Sign-in is currently unavailable."))
                .font(.footnote)
            Button(t("Try again"), action: retry)
                .buttonStyle(WorkspaceOutlineButton(palette: palette))
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
    var compact = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius)
        configuration.label.font(palette.font(compact ? 13 : 15, .heavy))
            .foregroundStyle(palette.onAccent)
            .padding(.horizontal, compact ? 9 : 12).padding(.vertical, compact ? 7 : 9)
            .frame(minHeight: 44)
            .background(palette.accent, in: shape)
            .overlay(shape.stroke(palette.border, lineWidth: palette.outline))
            .background(shape.fill(palette.border).offset(x: palette.shadowOffset, y: palette.shadowOffset))
            .contentShape(shape)
            .opacity(enabled ? 1 : 0.45)
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
    }
}
