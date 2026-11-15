import SwiftUI

struct LedgerMonth: View {
    let kind: LedgerKind
    let records: [LedgerRecord]
    @Binding var month: Date
    @EnvironmentObject private var store: WorkspaceStore
    @State private var selected = LedgerDate.today

    private struct Event: Identifiable {
        let id: String
        let title: String
        let time: String
        let route: WorkspaceRoute
        let status: String
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
                              route: .teachingClass(item.id), status: "class")
                    )
                }
            }
            for date in days where LedgerDate.calendar.isDate(date, equalTo: month, toGranularity: .month) {
                let weekday = (LedgerDate.calendar.component(.weekday, from: date) + 5) % 7 + 1
                output[LedgerDate.text(date)] = recurring[weekday]
            }
        } else {
            var indexes: [String: Int] = [:]
            for item in records {
                let date = item.text("sessionDate")
                let id = item.string("lessonId") ?? item.id
                let status = item.text("status")
                let event = Event(id: id, title: item.string("className") ??
                    (item.string("lessonId") == nil ? item.text("studentName") : store.t("Group lesson")),
                    time: item.text("startTime"), route: kind.route(item), status: status)
                if let index = indexes[id], let current = output[date]?[index] {
                    if current.status != "cancelled" && (status == "cancelled" || status == "planned") {
                        output[date]?[index] = event
                    }
                } else {
                    indexes[id] = output[date, default: []].count
                    output[date, default: []].append(event)
                }
            }
        }
        return output.mapValues { $0.sorted { ($0.time.isEmpty ? "24:00" : $0.time, $0.title, $0.id) <
            ($1.time.isEmpty ? "24:00" : $1.time, $1.title, $1.id) } }
    }

    var body: some View {
        let schedule = events
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 34, height: 38) }
                    .accessibilityLabel(store.t("Previous month"))
                Spacer()
                Text(month.formatted(.dateTime.month(.wide).year().locale(store.language)))
                    .font(.headline).multilineTextAlignment(.center)
                Spacer()
                Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 34, height: 38) }
                    .accessibilityLabel(store.t("Next month"))
            }
            Button(store.t("This month")) { month = .now; selected = LedgerDate.today }
                .buttonStyle(.bordered)
            if kind == .sessions {
                HStack { ForEach(["planned", "completed", "cancelled"], id: \.self) { LedgerBadge(code: $0) } }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 0), spacing: 1), count: 7), spacing: 1) {
                ForEach(1...7, id: \.self) { index in
                    Text(weekday(index, locale: store.language)).font(.caption.bold())
                        .lineLimit(1).minimumScaleFactor(0.65)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(store.palette.surface)
                }
                ForEach(days, id: \.self) { date in
                    let day = LedgerDate.text(date)
                    let inMonth = LedgerDate.calendar.isDate(date, equalTo: month, toGranularity: .month)
                    let entries = schedule[day] ?? []
                    Button { selected = day } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(date.formatted(.dateTime.day().locale(store.language))).font(.caption.bold())
                            ForEach(Array(entries.prefix(2))) { event in
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(event.time.isEmpty ? "—" : event.time).font(.system(size: 10).monospacedDigit().bold())
                                    Text(event.title).font(.system(size: 10))
                                }
                                .lineLimit(1).minimumScaleFactor(0.85)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(2)
                                .background(eventColor(event.status).opacity(0.35), in: RoundedRectangle(cornerRadius: 4))
                            }
                            if entries.count > 2 { Text("+\(entries.count - 2)").font(.system(size: 9)) }
                        }
                        .padding(2)
                        .frame(maxWidth: .infinity, minHeight: 94, alignment: .topLeading)
                        .foregroundStyle(store.palette.foreground.opacity(inMonth ? 1 : 0.55))
                        .background(selected == day ? store.palette.recordAccent.opacity(0.38) : store.palette.surface)
                    }
                    .disabled(!inMonth).buttonStyle(.plain)
                    .accessibilityLabel(date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(store.language))
                        + " · \(entries.count) " + store.t("events"))
                    .accessibilityAddTraits(selected == day ? .isSelected : [])
                }
            }
            .background(store.palette.border.opacity(0.5))
            Text(LedgerDate.date(selected)?.formatted(.dateTime.weekday(.wide).day().month(.wide).year().locale(store.language)) ?? selected)
                .font(.headline)
            if let selected = schedule[selected], !selected.isEmpty {
                ForEach(selected) { event in
                    NavigationLink(value: event.route) {
                        HStack {
                            Text(event.time.isEmpty ? "—" : event.time).monospacedDigit()
                            Text(event.title).fontWeight(.semibold)
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption)
                        }.padding(8)
                    }
                }
            } else {
                Text(store.t("No lessons on this day.")).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .onAppear { selectVisibleMonth() }
        .onChange(of: month) { _ in selectVisibleMonth() }
    }

    private func selectVisibleMonth() {
        guard let date = LedgerDate.date(selected),
              LedgerDate.calendar.isDate(date, equalTo: month, toGranularity: .month) else {
            selected = LedgerDate.range(.month, at: month).0
            return
        }
    }

    private func move(_ offset: Int) {
        let calendar = LedgerDate.calendar
        guard let start = calendar.dateInterval(of: .month, for: month)?.start,
              let next = calendar.date(byAdding: .month, value: offset, to: start) else { return }
        month = next
        selected = LedgerDate.text(next)
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
        WorkspaceScroll {
            if let error { LedgerError(message: error) { Task { await load() } } }
            if let data {
                ForEach(data.upcoming) { lesson in
                    if let route = WorkspaceRoute.from(lesson.path) {
                        NavigationLink(value: route) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(lesson.name ?? store.t("Group lesson")).font(.headline)
                                Text(lesson.date + " · " + (lesson.time ?? store.t("Time not set")))
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if data.upcoming.isEmpty { Text(store.t("No planned lessons in the schedule.")) }
            } else if error == nil { ProgressView() }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .navigationTitle(store.t("Upcoming lessons"))
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        error = nil
        do { data = try await store.read("/api/mobile/schedule") }
        catch { self.error = store.t(error.localizedDescription) }
    }
}
