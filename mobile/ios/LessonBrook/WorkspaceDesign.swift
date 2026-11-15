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
}

struct WorkspaceOutlineButton: ButtonStyle {
    let palette: WorkspacePalette
    var compact = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(palette.font(compact ? 13 : 15, .bold))
            .foregroundStyle(palette.foreground)
            .padding(.horizontal, compact ? 9 : 12).padding(.vertical, compact ? 7 : 9)
            .frame(minHeight: compact ? 36 : 44)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius))
            .overlay(RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius).stroke(palette.border, lineWidth: palette.outline))
            .background(RoundedRectangle(cornerRadius: palette.retroRows ? 99 : palette.fieldRadius)
                .fill(palette.border).offset(x: palette.shadowOffset, y: palette.shadowOffset))
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
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(store.palette.font(15, .semibold)).lineLimit(2)
            TextField(label, text: $text, prompt: Text(placeholder ?? "").foregroundColor(store.palette.secondaryInk), axis: axis)
                .font(store.palette.font(16)).textFieldStyle(.plain).lineLimit(axis == .vertical ? 3...6 : 1...1)
                .foregroundStyle(store.palette.foreground)
                .padding(.vertical, 9).modifier(WorkspaceControl())
                .accessibilityLabel(label)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    init(_ label: String, text: Binding<String>, axis: Axis = .horizontal, placeholder: String? = nil) {
        self.label = label; _text = text; self.axis = axis; self.placeholder = placeholder
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
    private var isClock: Bool { displayedComponents == .hourAndMinute }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(store.palette.font(15, .semibold)).lineLimit(2)
            Button { month = selection; optional?.wrappedValue = true; open = true } label: {
                HStack {
                    Text(placeholder ?? (optional?.wrappedValue == false ? "—" : isClock ? lessonTime(selection) : selection.formatted(.dateTime.day().month(.abbreviated).year().locale(store.language))))
                        .font(store.palette.font(16)).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 3)
                    Image(systemName: isClock ? "clock" : "calendar").font(.system(size: 14))
                }.foregroundStyle(store.palette.foreground).modifier(WorkspaceControl())
            }.buttonStyle(.plain).accessibilityLabel(label)
                .sheet(isPresented: $open) {
                    VStack(spacing: 14) {
                        HStack {
                            Text(label).font(store.palette.font(20, .bold))
                            Spacer()
                            Button(store.t("Done")) { open = false }.buttonStyle(WorkspaceOutlineButton(palette: store.palette))
                        }
                        if isClock {
                            DatePicker(label, selection: $selection, displayedComponents: .hourAndMinute)
                                .datePickerStyle(.wheel).labelsHidden().tint(store.palette.controlTint)
                            if optional != nil { Button(store.t("Clear time")) { optional?.wrappedValue = false; open = false } }
                        } else {
                            dateGrid
                        }
                    }.padding(16).background(store.palette.background).presentationDetents([.medium])
                }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var dateGrid: some View {
        let cal = LedgerDate.calendar
        let start = cal.dateInterval(of: .month, for: month)!.start
        let first = cal.dateInterval(of: .weekOfYear, for: start)!.start
        let count = cal.range(of: .day, in: .month, for: start)!.count
        let offset = cal.dateComponents([.day], from: first, to: start).day!
        return VStack(spacing: 8) {
            HStack {
                Button { month = cal.date(byAdding: .month, value: -1, to: start)! } label: { Image(systemName: "chevron.left").frame(width: 38, height: 38) }
                    .buttonStyle(.plain).accessibilityLabel(store.t("Previous month"))
                Spacer()
                Text(month.formatted(.dateTime.month(.wide).year().locale(store.language))).font(store.palette.font(17, .bold))
                Spacer()
                Button { month = cal.date(byAdding: .month, value: 1, to: start)! } label: { Image(systemName: "chevron.right").frame(width: 38, height: 38) }
                    .buttonStyle(.plain).accessibilityLabel(store.t("Next month"))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                ForEach(1...7, id: \.self) { day in Text(weekday(day, locale: store.language)).font(store.palette.font(12, .bold)) }
                ForEach(0..<((offset + count + 6) / 7 * 7), id: \.self) { index in
                    let date = cal.date(byAdding: .day, value: index, to: first)!
                    let active = cal.isDate(date, inSameDayAs: selection)
                    Button { selection = date; open = false } label: {
                        Text(String(cal.component(.day, from: date))).font(store.palette.font(15, active ? .bold : .regular))
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .foregroundStyle(active ? store.palette.onAccent : store.palette.foreground)
                            .background(active ? store.palette.accent : store.palette.surface,
                                        in: RoundedRectangle(cornerRadius: min(8, store.palette.radius)))
                    }.buttonStyle(.plain)
                        .disabled(!cal.isDate(date, equalTo: month, toGranularity: .month) || (maximum.map { date > $0 } ?? false))
                        .accessibilityLabel(LedgerDate.text(date))
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
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .center, spacing: 8) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square").font(.system(size: 20))
                configuration.label.font(store.palette.font(14))
                Spacer(minLength: 0)
            }.frame(minHeight: 34, alignment: .leading).foregroundStyle(store.palette.foreground)
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
        .font(store.palette.font()).foregroundStyle(store.palette.foreground).background(store.palette.background)
    }
}

struct WorkspaceSection<Content: View>: View {
    @EnvironmentObject private var store: WorkspaceStore
    var title: String? = nil
    var fill: Color? = nil
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title).font(store.palette.font(17, .bold)).padding(.bottom, 4)
                Divider().overlay(store.palette.border)
            }
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
            .modifier(WorkspacePanel(palette: store.palette, fill: fill ?? store.palette.surface))
    }
    init(_ title: String? = nil, fill: Color? = nil, @ViewBuilder content: @escaping () -> Content) { self.title = title; self.fill = fill; self.content = content }
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
    @ViewBuilder let content: () -> Content
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 12, alignment: .top)], alignment: .leading, spacing: 14) { content() }
    }
}

extension View {
    @ViewBuilder func workspaceModalBackground() -> some View {
        if #available(iOS 16.4, *) { self.presentationBackground(.clear) }
        else { self }
    }
}
