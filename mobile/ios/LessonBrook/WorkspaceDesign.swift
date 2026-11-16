import SwiftUI

// Native equivalents of the existing workspace tokens and components. Keep these
// aligned with globals.css, RecordNote, ThemedSelect and the mobile density rules.
extension WorkspacePalette {
    func font(_ size: CGFloat = 15, _ weight: Font.Weight = .regular) -> Font {
        if retroRows || fontDesign == .rounded { return .custom("Nunito", size: size, relativeTo: .body).weight(weight) }
        return .system(size: size, weight: weight, design: fontDesign)
    }
    var fieldRadius: CGFloat { min(radius, 16) }
    var secondaryInk: Color { foreground.opacity(dark ? 0.82 : 0.78) }
    var destructiveInk: Color { Self.color(dark ? 0xff9298 : 0xa72731) }
}

struct WorkspaceOutlineButton: ButtonStyle {
    let palette: WorkspacePalette
    var compact = false
    var cornerRadius: CGFloat? = nil
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius ?? (palette.retroRows ? 99 : palette.fieldRadius))
        return configuration.label.font(palette.font(compact ? 13 : 15, .bold))
            .foregroundStyle(palette.foreground)
            .padding(.horizontal, compact ? 9 : 12).padding(.vertical, compact ? 7 : 9)
            .frame(minHeight: compact ? 36 : 44)
            .background(palette.surface, in: shape)
            .overlay(shape.stroke(palette.border, lineWidth: palette.outline))
            .background(shape.fill(palette.border).offset(x: palette.shadowOffset, y: palette.shadowOffset))
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
            .opacity(enabled ? 1 : 0.45)
    }
}

struct WorkspaceControl: ViewModifier {
    var pill = false
    @EnvironmentObject private var store: WorkspaceStore
    func body(content: Content) -> some View {
        let p = store.palette
        let corner = pill && p.retroRows ? 99 : p.fieldRadius
        content.padding(.horizontal, 10).frame(minHeight: 44)
            .background(p.surface, in: RoundedRectangle(cornerRadius: corner))
            .overlay(RoundedRectangle(cornerRadius: corner).stroke(p.border, lineWidth: max(1, p.outline)))
            .background(RoundedRectangle(cornerRadius: corner).fill(p.border)
                .offset(x: p.shadowOffset > 0 ? 2 : 0, y: p.shadowOffset > 0 ? 2 : 0))
    }
}

struct WorkspaceField: View {
    @EnvironmentObject private var store: WorkspaceStore
    let label: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var placeholder: String? = nil
    var required = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(required ? label + " *" : label).font(store.palette.font(15, .semibold)).lineLimit(2)
            TextField(label, text: $text, prompt: Text(placeholder ?? "").foregroundColor(store.palette.secondaryInk), axis: axis)
                .font(store.palette.font(16)).textFieldStyle(.plain).lineLimit(axis == .vertical ? 3...6 : 1...1)
                .foregroundStyle(store.palette.foreground)
                .padding(.vertical, 9).modifier(WorkspaceControl())
                .accessibilityLabel(label)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    init(_ label: String, text: Binding<String>, axis: Axis = .horizontal, placeholder: String? = nil, required: Bool = false) {
        self.label = label; _text = text; self.axis = axis; self.placeholder = placeholder; self.required = required
    }
}

struct WorkspaceNotice: View {
    enum Tone { case information, error }

    @EnvironmentObject private var store: WorkspaceStore
    let message: String
    var tone: Tone = .information

    var body: some View {
        let p = store.palette
        let icon = tone == .error ? "exclamationmark.circle" : "info.circle"
        let fill = tone == .error ? Color.red.opacity(p.dark ? 0.22 : 0.10) : p.recordAccent.opacity(0.36)
        let shape = RoundedRectangle(cornerRadius: p.fieldRadius)
        Label(message, systemImage: icon)
            .font(p.font(13, .semibold))
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(p.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(fill, in: shape)
            .overlay(shape.strokeBorder(p.border, lineWidth: max(1, p.outline)))
    }
}

struct WorkspaceChoiceTrigger: View {
    @EnvironmentObject private var store: WorkspaceStore
    let title: String
    var compact = false
    var leadingIcon: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let leadingIcon { Image(systemName: leadingIcon).accessibilityHidden(true) }
                Text(title).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 2)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
            }
            .font(store.palette.font(compact ? 13 : 16, .semibold))
            .foregroundStyle(store.palette.foreground)
            .modifier(WorkspaceControl(pill: compact))
        }.buttonStyle(.plain)
    }
}

struct WorkspaceOptionRow: View {
    @EnvironmentObject private var store: WorkspaceStore
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let p = store.palette
        let shape = RoundedRectangle(cornerRadius: max(0, p.fieldRadius - 4))
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title).font(p.font(16, selected ? .bold : .medium)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if selected { Image(systemName: "checkmark").font(.body.weight(.semibold)).accessibilityHidden(true) }
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .frame(minHeight: 44)
            .foregroundStyle(selected ? p.onAccent : p.foreground)
            .background(selected ? p.accent : p.surface, in: shape)
            .overlay(shape.strokeBorder(p.border.opacity(selected ? 1 : 0.38), lineWidth: selected ? max(1, p.outline) : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct WorkspaceOptionPanel<Content: View>: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    let title: String
    var search: Binding<String>? = nil
    var searchLabel: String? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        let p = store.palette
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text(title).font(p.font(20, .heavy)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 22, height: 22) }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                    .accessibilityLabel(store.t("Close"))
            }
            .padding(.bottom, 2)
            if let search { WorkspaceField(searchLabel ?? store.t("Search"), text: search) }
            Divider().overlay(p.border.opacity(0.48))
            ScrollView {
                LazyVStack(spacing: 6, content: content)
                    .padding(.bottom, 3)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .padding(13)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .modifier(WorkspacePanel(palette: p, fill: p.surface))
        .padding(14)
        .foregroundStyle(p.foreground)
        .background(p.background.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("workspace-option-panel")
    }
}

struct WorkspaceChoice<Value: Hashable>: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dynamicTypeSize) private var textSize
    let label: String
    @Binding var selection: Value
    let options: [(Value, String)]
    var compact = false
    var leadingIcon: String? = nil
    @State private var open = false
    @State private var search = ""

    private var value: String? { options.first { $0.0 == selection }?.1 }
    private var searchable: Bool { options.count > 7 }
    private var filtered: [(Value, String)] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return options.filter { query.isEmpty || $0.1.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !compact { Text(label).font(store.palette.font(15, .semibold)).lineLimit(2) }
            WorkspaceChoiceTrigger(title: value ?? label, compact: compact, leadingIcon: leadingIcon) {
                search = ""
                open = true
            }
            .accessibilityLabel(label)
            .accessibilityValue(value ?? "")
            .sheet(isPresented: $open) {
                WorkspaceOptionPanel(title: label, search: searchable ? $search : nil) {
                    let matches = filtered
                    ForEach(matches, id: \.0) { option in
                        WorkspaceOptionRow(title: option.1, selected: selection == option.0) {
                            selection = option.0
                            open = false
                        }
                    }
                    if matches.isEmpty { Text(store.t("No matching options")).foregroundStyle(store.palette.secondaryInk).padding(10) }
                }
                .presentationDetents(searchable || textSize.isAccessibilitySize ? [.large] : [.height(CGFloat(106 + options.count * 50)), .large])
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct WorkspaceDatePicker: View {
    @EnvironmentObject private var store: WorkspaceStore
    let label: String
    @Binding var selection: Date
    var displayedComponents: DatePickerComponents = .date
    var maximum: Date? = nil
    var optional: Binding<Bool>? = nil
    var placeholder: String? = nil
    @State private var open = false
    @State private var month = Date()
    @State private var hour = 0
    @State private var minute = 0
    private var isClock: Bool { displayedComponents == .hourAndMinute }
    private var displayValue: String {
        if let placeholder { return placeholder }
        if optional?.wrappedValue == false { return "—" }
        return isClock ? lessonTime(selection) :
            selection.formatted(.dateTime.day().month(.abbreviated).year().locale(store.language))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(store.palette.font(15, .semibold)).lineLimit(2)
            Button {
                month = selection
                let time = LedgerDate.calendar.dateComponents([.hour, .minute], from: selection)
                hour = time.hour ?? 0
                minute = time.minute ?? 0
                open = true
            } label: {
                HStack {
                    Text(displayValue)
                        .font(store.palette.font(16)).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 3)
                    Image(systemName: isClock ? "clock" : "calendar").font(.system(size: 14))
                }.foregroundStyle(store.palette.foreground).modifier(WorkspaceControl())
            }.buttonStyle(.plain).accessibilityLabel(label).accessibilityValue(displayValue)
                .sheet(isPresented: $open) {
                    WorkspaceScroll(eager: true) {
                        WorkspaceSection {
                            HStack {
                                Text(label).font(store.palette.font(20, .heavy)).accessibilityAddTraits(.isHeader)
                                Spacer()
                                Button { open = false } label: { Image(systemName: "xmark").frame(width: 20, height: 20) }
                                    .buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
                                    .accessibilityLabel(store.t("Close"))
                            }
                            Divider().overlay(store.palette.border)
                            if isClock {
                                clockFields
                            } else {
                                dateGrid
                            }
                        }
                    }
                    .presentationDetents([.height(isClock ? 400 : 468), .large])
                    .presentationDragIndicator(.visible)
                }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var clockFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(format: "%02d:%02d", hour, minute))
                .font(store.palette.font(26, .heavy).monospacedDigit())
                .frame(maxWidth: .infinity)
                .modifier(WorkspaceControl())
                .accessibilityIdentifier("workspace-clock-value")
            HStack(alignment: .top, spacing: 10) {
                clockColumn("Hour", values: 0..<24, value: $hour)
                clockColumn("Minute", values: 0..<60, value: $minute)
            }
            HStack {
                if optional?.wrappedValue == true {
                    Button(store.t("Clear time")) { optional?.wrappedValue = false; open = false }
                        .buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
                }
                Spacer()
                Button(store.t("Done")) {
                    selection = LedgerDate.calendar.date(bySettingHour: hour, minute: minute, second: 0, of: selection) ?? selection
                    optional?.wrappedValue = true
                    open = false
                }.buttonStyle(WorkspaceActionButton(palette: store.palette))
            }
        }
    }

    private func clockColumn(_ title: String, values: Range<Int>, value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(store.t(title)).font(store.palette.font(14, .bold))
            ScrollViewReader { scroll in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(values, id: \.self) { item in
                            WorkspaceOptionRow(title: String(format: "%02d", item), selected: item == value.wrappedValue) {
                                value.wrappedValue = item
                            }
                            .id(item)
                            .accessibilityIdentifier("workspace-clock-\(title.lowercased())-\(item)")
                        }
                    }.padding(5)
                }
                .frame(height: 154)
                .onAppear { scroll.scrollTo(value.wrappedValue, anchor: .center) }
            }
        }
    }
    private var dateGrid: some View {
        let cal = LedgerDate.calendar
        let start = cal.dateInterval(of: .month, for: month)!.start
        let first = cal.dateInterval(of: .weekOfYear, for: start)!.start
        let count = cal.range(of: .day, in: .month, for: start)!.count
        let offset = cal.dateComponents([.day], from: first, to: start).day!
        return VStack(spacing: 8) {
            HStack {
                Button { month = cal.date(byAdding: .month, value: -1, to: start)! } label: { Image(systemName: "chevron.left").frame(width: 16, height: 20) }
                    .buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true)).accessibilityLabel(store.t("Previous month"))
                Spacer()
                Text(month.formatted(.dateTime.month(.wide).year().locale(store.language))).font(store.palette.font(17, .bold))
                Spacer()
                Button { month = cal.date(byAdding: .month, value: 1, to: start)! } label: { Image(systemName: "chevron.right").frame(width: 16, height: 20) }
                    .buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true)).accessibilityLabel(store.t("Next month"))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                ForEach(1...7, id: \.self) { day in Text(weekday(day, locale: store.language)).font(store.palette.font(12, .bold)) }
                ForEach(0..<((offset + count + 6) / 7 * 7), id: \.self) { index in
                    let date = cal.date(byAdding: .day, value: index, to: first)!
                    let inMonth = cal.isDate(date, equalTo: month, toGranularity: .month)
                    let active = inMonth && cal.isDate(date, inSameDayAs: selection)
                    Button { selection = date; open = false } label: {
                        Text(String(cal.component(.day, from: date))).font(store.palette.font(15, active ? .bold : .regular))
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .foregroundStyle(active ? store.palette.dashboardInk : store.palette.foreground.opacity(inMonth ? 1 : 0.55))
                            .background(active ? store.palette.calendarSelection : store.palette.surface,
                                        in: RoundedRectangle(cornerRadius: min(8, store.palette.fieldRadius)))
                            .contentShape(Rectangle())
                    }.buttonStyle(.plain)
                        .disabled(!inMonth || (maximum.map { date > $0 } ?? false))
                        .accessibilityLabel(LedgerDate.text(date))
                        .accessibilityAddTraits(active ? .isSelected : [])
                }
            }
        }.foregroundStyle(store.palette.foreground)
    }
    init(_ label: String, selection: Binding<Date>, displayedComponents: DatePickerComponents = .date, optional: Binding<Bool>? = nil, placeholder: String? = nil) {
        self.label = label; _selection = selection; self.displayedComponents = displayedComponents; self.optional = optional; self.placeholder = placeholder
    }
    init(_ label: String, selection: Binding<Date>, in range: PartialRangeThrough<Date>, displayedComponents: DatePickerComponents = .date) {
        self.label = label; _selection = selection; maximum = range.upperBound; self.displayedComponents = displayedComponents
    }
}

struct WorkspaceCheckbox: ToggleStyle {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        let p = store.palette
        let shape = RoundedRectangle(cornerRadius: min(4, p.fieldRadius))
        return Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .center, spacing: 8) {
                ZStack {
                    shape.fill(configuration.isOn ? p.accent : p.surface)
                    shape.strokeBorder(p.border, lineWidth: max(1, p.outline))
                    if configuration.isOn {
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(p.onAccent)
                    }
                }.frame(width: 20, height: 20).accessibilityHidden(true)
                configuration.label.font(p.font(14))
                Spacer(minLength: 0)
            }.frame(minHeight: 36, alignment: .leading).foregroundStyle(p.foreground)
                .opacity(enabled ? 1 : 0.48).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityValue(configuration.isOn ? store.t("Selected") : store.t("Not selected"))
    }
}

/// Keeps actions on one line when they fit, with a stacked fallback.
struct WorkspaceActionRows<Content: View>: View {
    var centered = false
    var spacing: CGFloat = 8
    @ViewBuilder let content: () -> Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: spacing, content: content)
                .fixedSize(horizontal: true, vertical: false)
            VStack(alignment: centered ? .center : .leading, spacing: spacing, content: content)
        }
        .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }
}

private struct WorkspaceRootActionKey: EnvironmentKey {
    static let defaultValue: ((WorkspaceTab) -> Void)? = nil
}

extension EnvironmentValues {
    var openWorkspaceRoot: ((WorkspaceTab) -> Void)? {
        get { self[WorkspaceRootActionKey.self] }
        set { self[WorkspaceRootActionKey.self] = newValue }
    }
}

struct WorkspaceBackLink: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openWorkspaceRoot) private var openWorkspaceRoot
    let title: String
    var tab: WorkspaceTab? = nil

    init(_ title: String, tab: WorkspaceTab? = nil) {
        self.title = title
        self.tab = tab
    }

    var body: some View {
        Button {
            if let tab, let openWorkspaceRoot { openWorkspaceRoot(tab) }
            else { dismiss() }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.left").font(.system(size: 12)).accessibilityHidden(true)
                Text(store.t(title)).underline().font(store.palette.font(14))
            }
            .frame(minHeight: 32, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("workspace-detail-back")
    }
}

struct WorkspaceScroll<Content: View>: View {
    @EnvironmentObject private var store: WorkspaceStore
    var eager = false
    @ViewBuilder let content: () -> Content
    var body: some View {
        ScrollView {
            Group {
                if eager {
                    VStack(alignment: .leading, spacing: 16, content: content)
                } else {
                    LazyVStack(alignment: .leading, spacing: 16, content: content)
                }
            }.padding(12)
        }
        .scrollDismissesKeyboard(.interactively)
        .font(store.palette.font()).foregroundStyle(store.palette.foreground).background(store.palette.background)
    }
}

struct WorkspaceSection<Content: View>: View {
    @EnvironmentObject private var store: WorkspaceStore
    var title: String? = nil
    var fill: Color? = nil
    var padding: CGFloat = 12
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title).font(store.palette.font(17, .bold)).padding(.bottom, 4)
                Divider().overlay(store.palette.border)
            }
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(padding)
            .modifier(WorkspacePanel(palette: store.palette, fill: fill ?? store.palette.surface))
    }
    init(_ title: String? = nil, fill: Color? = nil, padding: CGFloat = 12, @ViewBuilder content: @escaping () -> Content) { self.title = title; self.fill = fill; self.padding = padding; self.content = content }
}

struct WorkspaceListCard<Content: View>: View {
    @EnvironmentObject private var store: WorkspaceStore
    @ViewBuilder let content: () -> Content

    var body: some View {
        let p = store.palette
        VStack(alignment: .leading, spacing: 0, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: p.radius))
            .modifier(WorkspacePanel(palette: p, fill: p.surface))
    }
}

struct WorkspaceListTone: ViewModifier {
    let palette: WorkspacePalette
    let color: Color

    func body(content: Content) -> some View {
        content.background {
            palette.surface
            if palette.retroRows { color.opacity(0.3) }
        }
        .overlay(alignment: .leading) {
            if palette.retroRows { color.frame(width: 5).allowsHitTesting(false) }
        }
    }
}

struct WorkspaceScheduleRow: View {
    let title: String
    let details: String
    let palette: WorkspacePalette
    let index: Int

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: min(palette.radius, 14))
        return HStack(spacing: 9) {
            Text(String(title.prefix(1)).uppercased())
                .font(.system(.subheadline, design: palette.fontDesign).weight(.medium))
                .frame(width: 40, height: 40)
                .background(palette.recordAccent, in: RoundedRectangle(cornerRadius: 3))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(.body, design: palette.fontDesign).bold())
                Text(details).font(.system(.footnote, design: palette.fontDesign))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .foregroundStyle(palette.foreground)
        .background(palette.recordAccent.opacity(0.7), in: shape)
        .background(palette.surface, in: shape)
        .overlay(shape.strokeBorder(palette.controlTint, lineWidth: 2))
        .padding(12)
        .modifier(WorkspaceListTone(palette: palette, color: index.isMultiple(of: 2) ? palette.blue : palette.mint))
        .contentShape(Rectangle())
    }
}

struct WorkspaceKeyValue: View {
    @EnvironmentObject private var store: WorkspaceStore
    let label: String
    let value: String
    init(_ label: String, value: String) { self.label = label; self.value = value }
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label).foregroundStyle(store.palette.secondaryInk)
            Spacer(minLength: 2)
            Text(value).multilineTextAlignment(.trailing)
        }.font(store.palette.font(14)).frame(maxWidth: .infinity)
    }
}

struct WorkspaceViewButton: ButtonStyle {
    let palette: WorkspacePalette
    let active: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(palette.font(16, .semibold)).frame(width: 42, height: 42)
            .foregroundStyle(active ? palette.onAccent : palette.foreground)
            .background(active ? palette.accent : palette.surface, in: RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius))
            .overlay(RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius).stroke(palette.border, lineWidth: palette.outline))
            .background(RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius).fill(palette.border)
                .offset(x: palette.shadowOffset, y: palette.shadowOffset))
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
    }
}

struct WorkspacePaperShape: Shape {
    var radius: CGFloat
    func path(in rect: CGRect) -> Path {
        let r = min(radius, min(rect.width, rect.height) / 2)
        var p = Path()
        p.move(to: CGPoint(x: r, y: 0)); p.addLine(to: CGPoint(x: rect.maxX-r, y: 0))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: r), control: CGPoint(x: rect.maxX, y: 0))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY)); p.addLine(to: CGPoint(x: r, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: 0, y: rect.maxY-r), control: CGPoint(x: 0, y: rect.maxY))
        p.addLine(to: CGPoint(x: 0, y: r)); p.addQuadCurve(to: CGPoint(x: r, y: 0), control: .zero)
        p.closeSubpath(); return p
    }
}

func workspacePaperColor(_ id: String) -> Color {
    var hash: UInt32 = 0
    for value in id.utf16 { hash = (hash &* 31) &+ UInt32(value) }
    let colors = [0xffdf77, 0xffafcb, 0xa4d9ff, 0x9ae6b7, 0xd9bafa, 0xffbd99]
    let rgb = colors[Int(hash % 6)]
    return Color(red: Double(rgb >> 16 & 255)/255, green: Double(rgb >> 8 & 255)/255, blue: Double(rgb & 255)/255)
}

struct WorkspaceFieldColumns<Content: View>: View {
    var minimum: CGFloat = 190
    @ViewBuilder let content: () -> Content
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: minimum), spacing: 12, alignment: .top)], alignment: .leading, spacing: 14) { content() }
    }
}

extension View {
    @ViewBuilder func workspaceModalBackground() -> some View {
        if #available(iOS 16.4, *) { self.presentationBackground(.clear) }
        else { self }
    }
}
