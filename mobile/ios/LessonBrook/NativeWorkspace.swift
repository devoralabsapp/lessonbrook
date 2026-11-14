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
    let schedule: Schedule?

    struct Schedule: Decodable {
        let today: String
        let items: [Lesson]
        let recurring: [Lesson]?

        var upcoming: [Lesson] {
            Array((items + (recurring ?? [])).sorted {
                ($0.date, $0.time ?? "24:00", $0.id) < ($1.date, $1.time ?? "24:00", $1.id)
            }.prefix(8))
        }
    }

    struct Lesson: Decodable, Identifiable {
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

    init(_ theme: String? = nil) {
        let colors: (UInt32, UInt32, UInt32, UInt32, UInt32, Bool)
        switch theme {
        case "mono-os": colors = (0xd9d9d9, 0xffffff, 0x111111, 0x111111, 0xffffff, false)
        case "chapter-desk": colors = (0xf4e9d5, 0xfff5e2, 0xa34018, 0x29271f, 0xffffff, false)
        case "afterhours-fm": colors = (0x101010, 0x1d1d1d, 0xf7d449, 0xfaf9f3, 0x101010, true)
        case "margin-notes": colors = (0xf0e9df, 0xfffcf5, 0x713346, 0x30262b, 0xffffff, false)
        case "sticker-sprint": colors = (0xfff8ec, 0xfffaf1, 0xffd34e, 0x211b18, 0x211b18, false)
        default: colors = (0xfff6e6, 0xfffdf8, 0x734626, 0x211f1b, 0xffffff, false)
        }
        background = Self.color(colors.0)
        surface = Self.color(colors.1)
        accent = Self.color(colors.2)
        foreground = Self.color(colors.3)
        onAccent = Self.color(colors.4)
        dark = colors.5
        controlTint = theme == "sticker-sprint" ? Self.color(0x503298) : Self.color(colors.2)
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
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                tuition
                Button { open("/app/lessons/new") } label: {
                    Label(t("Record a lesson"), systemImage: "plus.circle")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.borderedProminent)
                .tint(palette.accent)
                .foregroundStyle(palette.onAccent)
                if let schedule = snapshot.schedule { scheduleView(schedule) }
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
            .padding(14)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await refresh() }
        .foregroundStyle(palette.foreground)
        .background(palette.background)
    }

    private var tuition: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { open("/app/statements?status=outstanding") } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(t("Outstanding tuition"), systemImage: "doc.text")
                            .font(.subheadline.weight(.semibold))
                        Text(money(snapshot.summary.outstandingVnd))
                            .font(.system(.largeTitle, design: .rounded).bold())
                            .monospacedDigit()
                    }
                    Spacer()
                    Image(systemName: "chevron.right").accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if snapshot.summary.overdueVnd > 0 {
                Button { open("/app/statements?status=overdue") } label: {
                    Label(String(format: t("%@ overdue"), money(snapshot.summary.overdueVnd)),
                          systemImage: "exclamationmark.circle")
                        .font(.footnote.weight(.semibold))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(palette.onAccent)
        .padding(14)
        .background(palette.accent, in: RoundedRectangle(cornerRadius: 22))
    }

    private func scheduleView(_ schedule: WorkspaceSnapshot.Schedule) -> some View {
        let items = schedule.upcoming
        return VStack(alignment: .leading, spacing: 9) {
            Text(t("Upcoming lessons")).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            if items.isEmpty {
                Text(t("No planned lessons in the next seven days."))
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(items, id: \.path) { lesson in
                        Button { open(lesson.path) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "calendar").foregroundStyle(palette.controlTint)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(lesson.name ?? t("Group lesson")).font(.subheadline.weight(.semibold))
                                    Text("\(dayLabel(lesson.date, today: schedule.today)) · \(lesson.time ?? t("Time not set"))")
                                        .font(.footnote)
                                    if lesson.kind == "recurring" { Text(t("Weekly")).font(.caption) }
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.footnote).accessibilityHidden(true)
                            }
                            .padding(.vertical, 10)
                            .frame(minHeight: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if lesson.path != items.last?.path { Divider() }
                    }
                }
                .padding(.horizontal, 14)
                .background(palette.surface, in: RoundedRectangle(cornerRadius: 16))
                Button(t("View full schedule")) { open("/app/schedule") }
                    .font(.subheadline.weight(.semibold))
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
               detail: String(format: t("%@ lessons"), number(snapshot.summary.unbilledCount)))
    }

    private var received: some View {
        metric("Received this month", value: money(snapshot.summary.receivedMonthVnd), icon: "arrow.down.circle")
    }

    private func metric(_ title: String, value: String, icon: String, detail: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).foregroundStyle(palette.controlTint).accessibilityHidden(true)
            Text(t(title)).font(.footnote.weight(.medium)).fixedSize(horizontal: false, vertical: true)
            Text(value).font(.headline.monospacedDigit()).fixedSize(horizontal: false, vertical: true)
            if let detail { Text(detail).font(.caption) }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(12)
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
                    .foregroundStyle(.white)
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
                    .buttonStyle(.borderedProminent)
                    .tint(palette.accent)
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
                .tint(palette.accent)
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
