package tech.devoralabs.lessonbrook;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class NativeWorkspace {
    enum Tab {
        DASHBOARD(R.string.dashboard, R.drawable.ic_today, null),
        STUDENTS(R.string.students, R.drawable.ic_students, "/app/students"),
        CLASSES(R.string.classes, R.drawable.ic_classes, "/app/classes"),
        LESSONS(R.string.lessons, R.drawable.ic_lessons, "/app/sessions"),
        STATEMENTS(R.string.statements, R.drawable.ic_tuition, "/app/statements");

        final int title;
        final int icon;
        final String path;

        Tab(int title, int icon, String path) {
            this.title = title;
            this.icon = icon;
            this.path = path;
        }
    }

    record Snapshot(
        String displayName, String theme, String locale, boolean needsOnboarding,
        long outstanding, long overdue, long unbilled, long unbilledCount, long received, long students,
        Schedule schedule
    ) {
        static Snapshot parse(JSONObject response) throws JSONException {
            JSONObject totals = response.getJSONObject("summary");
            return new Snapshot(
                response.getString("displayName"), response.getString("theme"), response.getString("locale"),
                response.getBoolean("needsOnboarding"), totals.getLong("outstandingVnd"), totals.getLong("overdueVnd"),
                totals.getLong("unbilledVnd"), totals.getLong("unbilledCount"),
                totals.getLong("receivedMonthVnd"), totals.getLong("activeStudents"),
                Schedule.parse(response.optJSONObject("schedule"))
            );
        }
    }

    record Schedule(String today, List<Lesson> items) {
        static Schedule parse(JSONObject data) throws JSONException {
            if (data == null) return null;
            List<Lesson> lessons = new ArrayList<>();
            appendLessons(lessons, data.getJSONArray("items"));
            appendLessons(lessons, data.optJSONArray("recurring"));
            lessons.sort(Comparator.comparing(Lesson::date)
                .thenComparing(lesson -> lesson.time() == null ? "24:00" : lesson.time())
                .thenComparing(Lesson::id));
            return new Schedule(data.getString("today"), Collections.unmodifiableList(lessons.subList(0, Math.min(8, lessons.size()))));
        }

        private static void appendLessons(List<Lesson> lessons, JSONArray items) throws JSONException {
            if (items == null) return;
            for (int i = 0; i < items.length(); i++) {
                var row = items.getJSONObject(i);
                lessons.add(new Lesson(
                    row.getString("id"), row.getString("kind"),
                    row.isNull("name") ? null : row.getString("name"), row.getString("date"),
                    row.isNull("time") ? null : row.getString("time")
                ));
            }
        }
    }

    record Lesson(String id, String kind, String name, String date, String time) {
        String path() {
            if ("recurring".equals(kind))
                return new Uri.Builder().path("/app/lessons/new").appendQueryParameter("classId", id)
                    .appendQueryParameter("date", date).appendQueryParameter("time", time).build().toString();
            return "/app/" + ("group".equals(kind) ? "lessons/" : "sessions/") + id;
        }
    }

    record Palette(int background, int surface, int accent, int foreground, int onAccent, boolean dark,
                   int controlTint, String theme) {
        static Palette from(String theme) {
            return switch (theme) {
                case "mono-os" -> new Palette(0xffd9d9d9, 0xffffffff, 0xff111111, 0xff111111, 0xffffffff, false, 0xff111111, "mono-os");
                case "chapter-desk" -> new Palette(0xfff4e9d5, 0xfffff5e2, 0xffa34018, 0xff29271f, 0xffffffff, false, 0xffa34018, "chapter-desk");
                case "afterhours-fm" -> new Palette(0xff101010, 0xff1d1d1d, 0xfff7d449, 0xfffaf9f3, 0xff101010, true, 0xfff7d449, "afterhours-fm");
                case "margin-notes" -> new Palette(0xfff0e9df, 0xfffffcf5, 0xff713346, 0xff30262b, 0xffffffff, false, 0xff713346, "margin-notes");
                case "sticker-sprint" -> new Palette(0xfffff8ec, 0xfffffaf1, 0xff503298, 0xff111111, 0xffffffff, false, 0xff503298, "sticker-sprint");
                default -> new Palette(0xfffff6e6, 0xfffffdf7, 0xffffd02c, 0xff211f1b, 0xff211f1b, false, 0xff211f1b, "playful-retro");
            };
        }
        int border() { return switch (theme) {
            case "mono-os" -> 0xff111111;
            case "chapter-desk" -> 0xff9d8c73;
            case "afterhours-fm" -> 0xff555551;
            case "margin-notes" -> 0xff9c8790;
            case "sticker-sprint" -> 0xff211b18;
            default -> 0xff211f1b;
        }; }
        int radius() { return switch (theme) {
            case "mono-os" -> 7;
            case "chapter-desk" -> 0;
            case "afterhours-fm" -> 16;
            case "margin-notes" -> 2;
            case "sticker-sprint" -> 16;
            default -> 20;
        }; }
        int outline() { return switch (theme) {
            case "mono-os" -> 1;
            case "chapter-desk" -> 1;
            case "afterhours-fm" -> 1;
            case "margin-notes" -> 1;
            case "sticker-sprint" -> 1;
            default -> 2;
        }; }
        int shadowOffset() { return switch (theme) {
            case "mono-os" -> 3;
            case "chapter-desk" -> 0;
            case "afterhours-fm" -> 0;
            case "margin-notes" -> 4;
            case "sticker-sprint" -> 4;
            default -> 4;
        }; }
        int yellow() { return switch (theme) {
            case "mono-os" -> 0xffffffff;
            case "chapter-desk" -> 0xfffff5e2;
            case "afterhours-fm" -> 0xfff7d449;
            case "margin-notes" -> 0xfff2d978;
            case "sticker-sprint" -> 0xffffd34e;
            default -> 0xffffd02c;
        }; }
        int blue() { return switch (theme) {
            case "mono-os" -> 0xffffffff;
            case "chapter-desk" -> 0xfffff5e2;
            case "afterhours-fm" -> 0xffdbabdf;
            case "margin-notes" -> 0xffded8eb;
            case "sticker-sprint" -> 0xffded2f9;
            default -> 0xff79c8ff;
        }; }
        int mint() { return switch (theme) {
            case "mono-os" -> 0xffffffff;
            case "chapter-desk" -> 0xfffff5e2;
            case "afterhours-fm" -> 0xff71d6c8;
            case "margin-notes" -> 0xffc5d9cd;
            case "sticker-sprint" -> 0xffbdebd9;
            default -> 0xff83e5b0;
        }; }
        int dashboardInk() { return switch (theme) {
            case "mono-os" -> 0xff111111;
            case "chapter-desk" -> 0xff29271f;
            case "afterhours-fm" -> 0xff211b18;
            case "margin-notes" -> 0xff30262b;
            case "sticker-sprint" -> 0xff111111;
            default -> 0xff211f1b;
        }; }
        int recordAccent() { return switch (theme) {
            case "mono-os" -> 0xffe7e7e7;
            case "chapter-desk" -> 0xffefdcac;
            case "afterhours-fm" -> 0xff323019;
            case "margin-notes" -> 0xffead5dd;
            case "sticker-sprint" -> 0xffbdebd9;
            default -> 0xffffd02c;
        }; }
        Typeface font() {
            return switch (theme) {
                case "mono-os" -> Typeface.MONOSPACE;
                case "chapter-desk", "margin-notes" -> Typeface.SERIF;
                case "playful-retro", "sticker-sprint" -> Typeface.create("sans-serif-rounded", Typeface.NORMAL);
                default -> Typeface.DEFAULT;
            };
        }
    }

    private final Context context;
    private final Palette palette;
    private final NumberFormat numbers;

    NativeWorkspace(Context owner, String locale, Palette palette) {
        Locale language = "vi".equals(locale) ? Locale.forLanguageTag("vi-VN") : Locale.US;
        Configuration configuration = new Configuration(owner.getResources().getConfiguration());
        configuration.setLocale(language);
        context = owner.createConfigurationContext(configuration);
        numbers = NumberFormat.getIntegerInstance(language);
        this.palette = palette;
    }

    String text(int id, Object... values) { return context.getString(id, values); }

    View welcome(Boolean available, boolean expired, boolean failed, Runnable signIn, Runnable demo, Runnable retry,
                 Runnable language, Runnable help) {
        LinearLayout page = column();
        page.setPadding(0, dp(14), dp(4), dp(12));
        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(heading(text(R.string.app_name), 18), new LinearLayout.LayoutParams(0, -2, 1));
        boolean vietnamese = "vi".equals(context.getResources().getConfiguration().getLocales().get(0).getLanguage());
        Button locale = button(vietnamese ? "Tiếng Việt" : "English", language, false);
        locale.setTextSize(14);
        header.addView(locale, new LinearLayout.LayoutParams(-2, -2));
        add(page, header, 0);

        LinearLayout entry = card(palette.surface(), 18);
        FrameLayout mark = new FrameLayout(context);
        View sheet = new View(context);
        GradientDrawable blueSheet = shape(palette.blue(), 14);
        blueSheet.setStroke(dp(2), palette.border());
        sheet.setBackground(blueSheet);
        sheet.setRotation(11);
        sheet.setTranslationX(dp(10));
        mark.addView(sheet, new FrameLayout.LayoutParams(dp(58), dp(66), Gravity.CENTER));
        ImageView cover = icon(R.drawable.lessonbrook_mark, palette.dashboardInk());
        cover.setBackground(panel(palette.yellow()));
        cover.setRotation(-7);
        cover.setTranslationX(-dp(6));
        mark.addView(cover, new FrameLayout.LayoutParams(dp(58), dp(66), Gravity.CENTER));
        mark.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        entry.addView(mark, new LinearLayout.LayoutParams(-1, dp(86)));

        TextView title = heading(text(R.string.sign_in), 32);
        title.setGravity(Gravity.CENTER);
        add(entry, title, 5);
        TextView description = label(text(R.string.welcome_description), 15, palette.foreground());
        description.setGravity(Gravity.CENTER);
        add(entry, description, 6);
        if (expired) {
            TextView status = label(text(R.string.session_expired), 13, palette.foreground());
            status.setGravity(Gravity.CENTER);
            status.setPadding(dp(8), dp(8), dp(8), dp(8));
            status.setBackground(shape(tint(palette.surface(), palette.yellow(), 0.32f), 10));
            add(entry, status, 10);
        }
        if (Boolean.TRUE.equals(available)) {
            add(entry, welcomeAction("G", text(R.string.continue_google), signIn, true), 16);
        } else if (failed || Boolean.FALSE.equals(available)) {
            TextView status = label(text(failed ? R.string.connection_help : R.string.sign_in_unavailable),
                13, palette.foreground());
            status.setGravity(Gravity.CENTER);
            add(entry, status, 12);
            add(entry, button(text(R.string.try_again), retry, false), 8);
        } else {
            LinearLayout.LayoutParams spinner = new LinearLayout.LayoutParams(dp(36), dp(36));
            spinner.gravity = Gravity.CENTER;
            spinner.topMargin = dp(12);
            entry.addView(loading(), spinner);
        }
        add(page, entry, 20);

        add(page, welcomeAction("▷", text(R.string.view_demo), demo, false), 20);
        TextView demoDescription = label(text(R.string.demo_description), 13, palette.foreground());
        demoDescription.setGravity(Gravity.CENTER);
        add(page, demoDescription, 9);
        TextView support = textAction(text(R.string.help_support), help);
        support.setGravity(Gravity.CENTER);
        add(page, support, 6);

        FrameLayout centered = new FrameLayout(context);
        int width = Math.min(400, Math.max(0, context.getResources().getConfiguration().screenWidthDp - 40));
        centered.addView(page, new FrameLayout.LayoutParams(dp(width), -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL));
        return scroll(centered);
    }

    private View welcomeAction(String symbol, String title, Runnable open, boolean primary) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(8), dp(14), dp(8));
        row.setMinimumHeight(dp(48));
        row.setBackground(actionBackground(primary));
        int ink = primary ? palette.onAccent() : palette.controlTint();
        TextView mark = bold(symbol, 16, ink);
        row.addView(mark, new LinearLayout.LayoutParams(dp(30), -2));
        row.addView(bold(title, 16, ink), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(bold("→", 16, ink));
        for (int i = 0; i < row.getChildCount(); i++)
            row.getChildAt(i).setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        action(row, title, open);
        return row;
    }

    private TextView textAction(String title, Runnable open) {
        TextView link = bold(title, 14, palette.controlTint());
        link.setMinimumHeight(dp(44));
        link.setPaintFlags(link.getPaintFlags() | Paint.UNDERLINE_TEXT_FLAG);
        link.setGravity(Gravity.CENTER_VERTICAL);
        action(link, title, open);
        return link;
    }

    View today(Snapshot data, Consumer<String> open) {
        LinearLayout page = page();
        add(page, heading(text(R.string.teaching_day), 25), 0);
        add(page, metric(R.string.outstanding_tuition, money(data.outstanding()), 32, palette.yellow(), false), 16);

        LinearLayout unbilled = metric(R.string.unbilled_lessons, money(data.unbilled()), 17, palette.blue(), true);
        LinearLayout received = metric(R.string.received_this_month, money(data.received()), 17, palette.mint(), true);
        float fontScale = context.getResources().getConfiguration().fontScale;
        if (context.getResources().getConfiguration().screenWidthDp >= 350 && fontScale <= 1.3f) {
            LinearLayout row = new LinearLayout(context);
            row.addView(unbilled, new LinearLayout.LayoutParams(0, -1, 1));
            LinearLayout.LayoutParams right = new LinearLayout.LayoutParams(0, -1, 1);
            right.setMarginStart(dp(12));
            row.addView(received, right);
            add(page, row, 16);
        } else {
            add(page, unbilled, 16);
            add(page, received, 12);
        }
        add(page, metric(R.string.active_students, numbers.format(data.students()), 20, null, false), 16);
        if (data.schedule() != null) add(page, schedule(data.schedule(), open), 16);
        if (data.needsOnboarding()) {
            add(page, button(text(R.string.get_started), () -> open.accept("/onboarding"), false), 8);
        }
        return scroll(page);
    }

    private View schedule(Schedule data, Consumer<String> open) {
        LinearLayout section = column();
        section.setBackground(panel(palette.surface()));
        int inset = dp(palette.outline());
        section.setPadding(inset, inset, inset + dp(palette.shadowOffset()),
            inset + dp(palette.shadowOffset()));
        TextView title = heading(text(R.string.upcoming_lessons), 20);
        title.setPadding(dp(12), dp(10), dp(12), dp(10));
        add(section, title, 0);
        scheduleDivider(section);
        if (data.items().isEmpty()) {
            TextView empty = label(text(R.string.no_planned_lessons), 14, palette.foreground());
            empty.setPadding(dp(12), dp(12), dp(12), dp(12));
            add(section, empty, 0);
            return section;
        }
        int index = 0;
        var dateFormat = DateTimeFormatter.ofPattern("d MMM yyyy",
            context.getResources().getConfiguration().getLocales().get(0));
        for (Lesson lesson : data.items()) {
            int tone = index++ % 2 == 0 ? palette.blue() : palette.mint();
            int ink = palette.foreground();
            String name = lesson.name() == null || lesson.name().isEmpty()
                ? text(R.string.group_lesson) : lesson.name();
            String day = data.today().equals(lesson.date()) ? text(R.string.today)
                : LocalDate.parse(lesson.date()).format(dateFormat);
            String time = lesson.time() == null ? text(R.string.time_not_set) : lesson.time();
            String when = day + " · " + time
                + ("recurring".equals(lesson.kind()) ? " · " + text(R.string.weekly) : "");
            LinearLayout identity = new LinearLayout(context);
            identity.setGravity(Gravity.CENTER_VERTICAL);
            identity.setPadding(dp(9), dp(6), dp(9), dp(6));
            GradientDrawable frame = shape(tint(palette.surface(), palette.recordAccent(), 0.7f),
                Math.min(palette.radius(), 14));
            frame.setStroke(dp(2), palette.controlTint());
            identity.setBackground(frame);
            TextView initial = bold(name.substring(0, name.offsetByCodePoints(0, 1))
                .toUpperCase(context.getResources().getConfiguration().getLocales().get(0)), 15, ink);
            initial.setGravity(Gravity.CENTER);
            initial.setBackground(shape(palette.recordAccent(), 3));
            identity.addView(initial, new LinearLayout.LayoutParams(dp(40), dp(40)));
            LinearLayout labels = column();
            add(labels, bold(name, 15, ink), 0);
            add(labels, label(when, 13, ink), 2);
            LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, -2, 1);
            labelParams.setMarginStart(dp(9));
            identity.addView(labels, labelParams);
            action(identity, name + ", " + when, () -> open.accept(lesson.path()));
            LinearLayout row = column();
            row.setPadding(dp(12), dp(12), dp(12), dp(12));
            if ("playful-retro".equals(palette.theme())) {
                LayerDrawable paper = new LayerDrawable(new Drawable[] {
                    shape(tint(palette.surface(), tone, 0.3f), 0), shape(tone, 0)
                });
                paper.setLayerWidth(1, dp(5));
                paper.setLayerGravity(1, Gravity.LEFT);
                row.setBackground(paper);
            }
            add(row, identity, 0);
            add(section, row, 0);
            scheduleDivider(section);
        }
        TextView footer = textAction(text(R.string.full_schedule), () -> open.accept("/app/schedule"));
        footer.setPadding(dp(12), 0, dp(12), 0);
        add(section, footer, 0);
        return section;
    }

    private void scheduleDivider(LinearLayout list) {
        View divider = new View(context);
        divider.setBackgroundColor(tint(palette.surface(), palette.border(), 0.4f));
        list.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
    }

    private static int tint(int base, int color, float strength) {
        float weight = 1f - strength;
        return Color.rgb(
            Math.round(Color.red(base) * weight + Color.red(color) * strength),
            Math.round(Color.green(base) * weight + Color.green(color) * strength),
            Math.round(Color.blue(base) * weight + Color.blue(color) * strength)
        );
    }

    View error(Runnable retry) {
        LinearLayout page = page();
        page.setGravity(Gravity.CENTER);
        add(page, label(text(R.string.load_error), 16, palette.foreground()), 0);
        add(page, button(text(R.string.try_again), retry, false), 12);
        return page;
    }

    ProgressBar loading() {
        ProgressBar progress = new ProgressBar(context);
        progress.setIndeterminateTintList(ColorStateList.valueOf(palette.accent()));
        progress.setContentDescription(text(R.string.loading));
        return progress;
    }

    View tabs(Tab selected, Consumer<Tab> select) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER);
        row.setBackgroundColor(palette.surface());
        row.setPadding(dp(6), dp(4), dp(6), dp(3));
        for (Tab tab : Tab.values()) {
            boolean active = tab == selected;
            LinearLayout item = column();
            item.setGravity(Gravity.CENTER);
            item.setMinimumHeight(dp(46));
            item.setPadding(dp(2), dp(3), dp(2), dp(3));
            item.setSelected(active);
            action(item, text(tab.title), () -> select.accept(tab));
            int ink = active ? palette.onAccent() : palette.foreground();
            if (active) item.setBackground(panel(palette.accent()));
            ImageView icon = icon(tab.icon, ink);
            item.addView(icon, new LinearLayout.LayoutParams(dp(18), dp(18)));
            TextView title = label(text(tab.title), 11, ink);
            if (active) title.setTypeface(palette.font(), Typeface.BOLD);
            title.setGravity(Gravity.CENTER);
            title.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            add(item, title, 2);
            row.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
        }
        return row;
    }

    private void action(View view, String title, Runnable action) {
        view.setContentDescription(title);
        view.setFocusable(true);
        view.setOnClickListener(target -> action.run());
        view.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.setClassName(Button.class.getName());
            }
        });
    }

    private LinearLayout metric(int title, String value, int size, Integer fill, boolean compact) {
        int ink = fill == null ? palette.foreground() : palette.dashboardInk();
        LinearLayout metric = card(fill == null ? palette.surface() : fill, 12);
        if (compact) metric.setMinimumHeight(dp(92));
        add(metric, label(text(title), compact ? 13 : 15, ink), 0);
        add(metric, bold(value, size, ink), 6);
        return metric;
    }

    private ImageView icon(int drawable, int color) {
        ImageView image = new ImageView(context);
        image.setImageResource(drawable);
        image.setImageTintList(ColorStateList.valueOf(color));
        image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return image;
    }

    private Button button(String title, Runnable action, boolean primary) {
        Button button = new Button(context);
        button.setAllCaps(false);
        button.setText(title);
        button.setTextSize(16);
        button.setTypeface(palette.font(), Typeface.BOLD);
        button.setTextColor(primary ? palette.onAccent() : palette.controlTint());
        button.setMinimumHeight(dp(50));
        button.setBackground(actionBackground(primary));
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private Drawable actionBackground(boolean primary) {
        return new RippleDrawable(ColorStateList.valueOf(0x28211f1b),
            panel(primary ? palette.accent() : palette.surface()), null);
    }

    private ScrollView scroll(View contents) {
        ScrollView scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(palette.background());
        scroll.addView(contents);
        return scroll;
    }

    private LinearLayout page() {
        LinearLayout page = column();
        page.setPadding(dp(12), dp(14), dp(12), dp(9));
        return page;
    }

    private LinearLayout column() {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    private LinearLayout card(int color, int padding) {
        LinearLayout card = column();
        card.setBackground(panel(color));
        card.setPadding(dp(padding), dp(padding), dp(padding), dp(padding));
        return card;
    }

    private Drawable panel(int color) {
        GradientDrawable face = shape(color, palette.radius());
        face.setStroke(dp(palette.outline()), palette.border());
        int offset = dp(palette.shadowOffset());
        if (offset == 0) return face;
        LayerDrawable layers = new LayerDrawable(new Drawable[] { shape(palette.border(), palette.radius()), face });
        layers.setLayerInset(0, offset, offset, 0, 0);
        layers.setLayerInset(1, 0, 0, offset, offset);
        return layers;
    }

    private GradientDrawable shape(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        return shape;
    }

    private void add(LinearLayout parent, View child, int top) {
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.topMargin = dp(top);
        parent.addView(child, layout);
    }

    private TextView heading(String text, int size) {
        TextView heading = bold(text, size, palette.foreground());
        if (android.os.Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
        return heading;
    }

    private TextView bold(String text, int size, int color) {
        TextView label = label(text, size, color);
        label.setTypeface(palette.font(), Typeface.BOLD);
        return label;
    }

    private TextView label(String text, int size, int color) {
        TextView label = new TextView(context);
        label.setText(text);
        label.setTextSize(size);
        label.setTypeface(palette.font());
        label.setTextColor(color);
        return label;
    }

    private String money(long vnd) {
        return "vi".equals(context.getResources().getConfiguration().getLocales().get(0).getLanguage())
            ? numbers.format(vnd) + "\u00a0₫" : "₫" + numbers.format(vnd);
    }
    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
