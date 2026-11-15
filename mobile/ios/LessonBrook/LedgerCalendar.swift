import SwiftUI

struct LedgerMonth: View {
    let kind: LedgerKind
    let records: [LedgerRecord]
    @Binding var month: Date
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.displayScale) private var displayScale
    @ScaledMetric(relativeTo: .caption) private var dayHeight = 94.0
    @State private var selected = LedgerDate.today

    private struct Event: Identifiable {
        let id: String
        let title: String
        let time: String
        let route: WorkspaceRoute
        var participants: Int
        var statuses: [String]

        var tone: String {
            if statuses.contains("cancelled") { return "cancelled" }
            if statuses.contains("planned") { return "planned" }
            return statuses.isEmpty ? "class" : "completed"
        }
    }

    private var days: [Date] {
        let cal = LedgerDate.calendar
        guard let start = cal.dateInterval(of: .month, for: month)?.start,
              let first = cal.dateInterval(of: .weekOfYear, for: start)?.start,
              let count = cal.range(of: .day, in: .month, for: start)?.count else { return [] }
        let offset = cal.dateComponents([.day], from: first, to: start).day ?? 0
        return (0..<((offset + count + 6) / 7 * 7)).compactMap { cal.date(byAdding: .day, value: $0, to: first) }
    }

    private var events: [String: [Event]] {
        var output: [String: [Event]] = [:]
        if kind == .classes {
            var recurring: [Int: [Event]] = [:]
            for item in records where item.string("archivedAt") == nil {
                for slot in item.objects("weeklySchedule") {
                    recurring[slot.int("weekday"), default: []].append(
                        .init(id: item.id + ":" + slot.text("time"), title: item.name, time: slot.text("time"),
                              route: .teachingClass(item.id), participants: item.strings("studentIds").count, statuses: [])
                    )
                }
            }
            for date in days where LedgerDate.calendar.isDate(date, equalTo: month, toGranularity: .month) {
                let weekday = (LedgerDate.calendar.component(.weekday, from: date) + 5) % 7 + 1
                output[LedgerDate.text(date)] = recurring[weekday]
            }
        } else {
            var indexes: [String: [String: Int]] = [:]
            for item in records {
                let date = item.text("sessionDate")
                let id = item.string("lessonId") ?? item.id
                let status = item.text("status")
                if let index = indexes[date]?[id] {
                    output[date]?[index].participants += 1
                    if output[date]?[index].statuses.contains(status) == false { output[date]?[index].statuses.append(status) }
                } else {
                    let title = item.string("lessonId") == nil ? item.string("studentName") : item.string("className")
                    let event = Event(id: id, title: title ?? store.t("Custom student group"), time: item.text("startTime"),
                                      route: kind.route(item), participants: 1, statuses: [status])
                    indexes[date, default: [:]][id] = output[date, default: []].count
                    output[date, default: []].append(event)
                }
            }
        }
        return output.mapValues { $0.sorted { ($0.time.isEmpty ? "24:00" : $0.time, $0.title, $0.id) <
            ($1.time.isEmpty ? "24:00" : $1.time, $1.title, $1.id) } }
    }

    var body: some View {
        let schedule = events
        let line = 1 / displayScale
        let p = store.palette
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 34, height: 38) }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                    .accessibilityLabel(store.t("Previous month"))
                Spacer()
                Text(LedgerDate.localized(month, locale: store.language, style: .dateTime.month(.wide).year()))
                    .font(p.font(17, .heavy)).multilineTextAlignment(.center)
                    .accessibilityIdentifier("workspace-calendar-month")
                Spacer()
                Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 34, height: 38) }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                    .accessibilityLabel(store.t("Next month"))
            }
            if kind == .sessions {
                HStack { ForEach(["planned", "completed", "cancelled"], id: \.self) { LedgerBadge(code: $0) } }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 0), spacing: line), count: 7), spacing: line) {
                ForEach(1...7, id: \.self) { index in
                    Text(weekday(index, locale: store.language)).font(.caption.bold())
                        .lineLimit(1).minimumScaleFactor(0.65)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background { Rectangle().fill(store.palette.background) }
                }
                ForEach(days, id: \.self) { date in
                    let day = LedgerDate.text(date)
                    let inMonth = LedgerDate.calendar.isDate(date, equalTo: month, toGranularity: .month)
                    let isSelected = selected == day
                    let entries = schedule[day] ?? []
                    Button { selected = day } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(String(LedgerDate.calendar.component(.day, from: date)))
                                .font(.caption.bold())
                                .lineLimit(1)
                                .padding(.horizontal, 2)
                            ForEach(Array(entries.prefix(2))) { event in
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(event.time.isEmpty ? "—" : event.time).font(.system(size: 10).monospacedDigit().bold())
                                    Text(event.title).font(.system(size: 10))
                                }
                                .lineLimit(1).minimumScaleFactor(0.85)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(2)
                                .foregroundStyle(store.palette.dashboardInk)
                                .background(eventColor(event.tone).opacity(0.42), in: RoundedRectangle(cornerRadius: 3))
                                .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 3))
                                .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(p.border.opacity(0.65), lineWidth: line))
                            }
                            if entries.count > 2 { Text("+\(entries.count - 2)").font(.system(size: 9)) }
                        }
                        .padding(2)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .frame(height: dayHeight, alignment: .topLeading)
                        .contentShape(Rectangle())
                    }
                    .foregroundStyle(isSelected ? store.palette.dashboardInk : store.palette.foreground.opacity(inMonth ? 1 : 0.55))
                    .buttonStyle(.plain)
                    .disabled(!inMonth)
                    .background {
                        Rectangle().fill(isSelected ? store.palette.calendarSelection :
                                            inMonth ? store.palette.surface : store.palette.background)
                    }
                    .accessibilityLabel(LedgerDate.localized(date, locale: store.language, style: .dateTime.weekday(.wide).day().month(.wide))
                        + " · \(entries.count) " + store.t("events"))
                    .accessibilityIdentifier("calendar-day-\(day)")
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(line)
            .background { Rectangle().fill(p.border) }
            .overlay { Rectangle().strokeBorder(p.border, lineWidth: max(1, p.outline)).allowsHitTesting(false) }
            dayAgenda(schedule[selected] ?? [], palette: p)
        }
        .padding(10)
        .modifier(WorkspacePanel(palette: p, fill: p.surface))
        .onAppear { selectVisibleMonth() }
        .onChange(of: month) { _ in selectVisibleMonth() }
    }

    private func dayAgenda(_ entries: [Event], palette p: WorkspacePalette) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            let date = LedgerDate.date(selected).map {
                LedgerDate.localized($0, locale: store.language, style: .dateTime.weekday(.wide).day().month(.wide).year())
            } ?? selected
            Text(date).font(p.font(15, .bold)).accessibilityAddTraits(.isHeader)
                .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                .background(p.background)
                .accessibilityIdentifier("calendar-agenda-title")
            Rectangle().fill(p.border).frame(height: 1 / displayScale)
            if entries.isEmpty {
                Text(store.t("No lessons on this day.")).font(p.font(14))
                    .foregroundStyle(p.secondaryInk).padding(10)
            }
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, event in
                if index > 0 { Rectangle().fill(p.border).frame(height: 1 / displayScale) }
                NavigationLink(value: event.route) {
                    HStack(alignment: .center, spacing: 9) {
                        Text(event.time.isEmpty ? "—" : event.time).font(p.font(14, .bold)).monospacedDigit()
                            .frame(minWidth: 43, alignment: .leading)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.title).font(p.font(14, .bold)).fixedSize(horizontal: false, vertical: true)
                            Text("\(event.participants) " + store.t(event.participants == 1 ? "student" : "students"))
                                .font(p.font(12)).foregroundStyle(p.secondaryInk)
                            if event.statuses.count > 1 {
                                WorkspaceActionRows(spacing: 4) {
                                    ForEach(event.statuses, id: \.self) { LedgerBadge(code: $0) }
                                }
                            }
                        }
                        Spacer(minLength: 0)
                        if event.statuses.count == 1, let status = event.statuses.first { LedgerBadge(code: status) }
                        Image(systemName: "chevron.right").font(.caption).accessibilityHidden(true)
                    }
                    .padding(10).frame(maxWidth: .infinity, minHeight: 45, alignment: .leading)
                    .contentShape(Rectangle())
                    .modifier(WorkspaceListTone(palette: p, color: eventColor(event.tone)))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("calendar-agenda-row-\(event.id)")
            }
        }
        .overlay { Rectangle().strokeBorder(p.border, lineWidth: 1).allowsHitTesting(false) }
    }

    private func selectVisibleMonth() {
        guard let date = LedgerDate.date(selected),
              LedgerDate.calendar.isDate(date, equalTo: month, toGranularity: .month) else {
            selected = defaultDay(in: month)
            return
        }
    }

    private func move(_ offset: Int) {
        let calendar = LedgerDate.calendar
        guard let start = calendar.dateInterval(of: .month, for: month)?.start,
              let next = calendar.date(byAdding: .month, value: offset, to: start) else { return }
        month = next
        selected = defaultDay(in: next)
    }

    private func defaultDay(in month: Date) -> String {
        if LedgerDate.calendar.isDate(.now, equalTo: month, toGranularity: .month) { return LedgerDate.today }
        return LedgerDate.range(.month, at: month).0
    }

    private func eventColor(_ status: String) -> Color {
        switch status {
        case "completed": return store.palette.mint
        case "planned": return store.palette.yellow
        case "cancelled": return Color(red: 0.98, green: 0.62, blue: 0.67)
        default: return store.palette.blue
        }
    }
}

struct NativeSchedule: View {
    @EnvironmentObject private var store: WorkspaceStore
    @State private var data: WorkspaceSnapshot.Schedule?
    @State private var error: String?

    var body: some View {
        let p = store.palette
        WorkspaceScroll(eager: true) {
            Text(store.t("Upcoming lessons")).font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
            if let data {
                let range = [data.today, data.through].compactMap { $0 }.map { LedgerDate.localized($0, locale: store.language) }
                Text(range.joined(separator: " – "))
                    .font(p.font(14)).foregroundStyle(p.secondaryInk)
                    .accessibilityIdentifier("upcoming-date-range")
                let lessons = data.orderedLessons
                if lessons.isEmpty {
                    WorkspaceNotice(message: store.t("No planned lessons in the schedule."))
                } else {
                    WorkspaceListCard {
                        ForEach(Array(lessons.enumerated()), id: \.element.path) { index, lesson in
                            if let route = WorkspaceRoute.from(lesson.path) {
                                if index > 0 { Divider().overlay(p.border) }
                                NavigationLink(value: route) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(lesson.name ?? store.t("Custom student group"))
                                            .font(p.font(15, .bold))
                                        Text(lessonDetails(lesson)).font(p.font(13)).foregroundStyle(p.secondaryInk)
                                    }
                                    .padding(12).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("upcoming-lesson-\(lesson.path)")
                            }
                        }
                    }
                }
            } else if error == nil {
                ProgressView().tint(p.controlTint)
            }
            if let error { LedgerError(message: error) { Task { await load() } } }
        }
        .task(id: store.revision) { await load() }
        .refreshable { await load() }
    }

    private func lessonDetails(_ lesson: WorkspaceSnapshot.Lesson) -> String {
        let time = lesson.time ?? store.t("Time not set")
        let weekly = lesson.kind == "recurring" ? " · " + store.t("Weekly") : ""
        return LedgerDate.localized(lesson.date, locale: store.language) + " · " + time + weekly
    }

    private func load() async {
        error = nil
        do {
            let schedule: WorkspaceSnapshot.Schedule = try await store.read("/api/mobile/schedule")
            try Task.checkCancellation()
            data = schedule
        } catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
    }
}
