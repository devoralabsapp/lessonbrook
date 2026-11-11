package tech.devoralabs.lessonbrook;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONObject;

final class NativeWorkspace {
    enum Tab {
        TODAY(R.string.today, R.drawable.ic_today, null),
        STUDENTS(R.string.students, R.drawable.ic_students, "/app/students"),
        LESSONS(R.string.lessons, R.drawable.ic_lessons, "/app/sessions"),
        TUITION(R.string.tuition, R.drawable.ic_tuition, "/app/statements"),
        MORE(R.string.more, R.drawable.ic_more, null);

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
            var items = data.getJSONArray("items");
            List<Lesson> lessons = new ArrayList<>();
            for (int i = 0; i < items.length(); i++) {
                var row = items.getJSONObject(i);
                lessons.add(new Lesson(
                    row.getString("id"), row.getString("kind"),
                    row.isNull("name") ? null : row.getString("name"), row.getString("date"),
                    row.isNull("time") ? null : row.getString("time")
                ));
            }
            return new Schedule(data.getString("today"), Collections.unmodifiableList(lessons));
        }
    }

    record Lesson(String id, String kind, String name, String date, String time) {
        String path() { return "/app/" + ("group".equals(kind) ? "lessons/" : "sessions/") + id; }
    }

    record Palette(int background, int surface, int accent, boolean dark) {
        static Palette from(String theme) {
            return switch (theme) {
                case "modern" -> new Palette(0xffedf3fb, 0xffffffff, 0xff2858a0, false);
                case "vintage" -> new Palette(0xfff5eee1, 0xfffffcf5, 0xff805332, false);
                case "art" -> new Palette(0xfffaf0f6, 0xfffffcff, 0xff854078, false);
                case "ocean" -> new Palette(0xffedf7f8, 0xffffffff, 0xff176676, false);
                case "command-line" -> new Palette(0xff000000, 0xff151515, 0xff74e6a1, true);
                case "visual-code" -> new Palette(0xff1e1e1e, 0xff252526, 0xff75beff, true);
                case "playful-retro" -> new Palette(0xfffff6e6, 0xfffffdf8, 0xff734626, false);
                default -> new Palette(0xfff7f8f3, 0xffffffff, 0xff296447, false);
            };
        }

        int foreground() { return dark ? Color.WHITE : 0xff192b23; }
        int onAccent() { return dark ? Color.BLACK : Color.WHITE; }
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

    View welcome(Boolean available, boolean expired, boolean failed, Runnable signIn, Runnable retry,
                 Runnable language, Runnable help) {
        LinearLayout page = column();
        page.setPadding(dp(26), dp(72), dp(26), dp(24));
        ImageView mark = new ImageView(context);
        mark.setImageResource(R.drawable.lessonbrook_mark);
        mark.setBackground(shape(palette.accent(), 18));
        mark.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        page.addView(mark, new LinearLayout.LayoutParams(dp(66), dp(66)));
        add(page, heading(text(R.string.app_name), 36), 18);
        add(page, label(text(R.string.welcome_description), 16, palette.foreground()), 8);
        if (expired) add(page, label(text(R.string.session_expired), 14, palette.foreground()), 14);
        if (Boolean.TRUE.equals(available)) {
            add(page, button(text(R.string.continue_google), signIn, true), 24);
        } else if (failed) {
            add(page, label(text(R.string.load_error), 14, palette.foreground()), 16);
            add(page, button(text(R.string.try_again), retry, false), 8);
        } else if (Boolean.FALSE.equals(available)) {
            add(page, label(text(R.string.sign_in_unavailable), 14, palette.foreground()), 16);
            add(page, button(text(R.string.try_again), retry, false), 8);
        } else {
            add(page, loading(), 18);
        }
        LinearLayout links = new LinearLayout(context);
        links.addView(button("vi".equals(context.getResources().getConfiguration().getLocales().get(0).getLanguage())
            ? "Tiếng Việt" : "English", language, false), new LinearLayout.LayoutParams(0, -2, 1));
        links.addView(button(text(R.string.help_support), help, false), new LinearLayout.LayoutParams(0, -2, 1));
        add(page, links, 10);
        return scroll(page);
    }

    View today(Snapshot data, Consumer<String> open) {
        LinearLayout page = page();
        add(page, heading(text(R.string.hello, data.displayName()), 32), 0);
        LinearLayout hero = card(palette.accent(), 22, 20);
        LinearLayout outstanding = column();
        add(outstanding, label(text(R.string.outstanding_tuition), 15, palette.onAccent()), 0);
        add(outstanding, bold(money(data.outstanding()) + " ›", 34, palette.onAccent()), 6);
        action(outstanding, text(R.string.outstanding_tuition) + " " + money(data.outstanding()),
            () -> open.accept("/app/statements?status=outstanding"));
        add(hero, outstanding, 0);
        if (data.overdue() > 0) {
            String title = text(R.string.overdue_amount, money(data.overdue()));
            TextView overdue = bold(title + " ›", 14, palette.onAccent());
            overdue.setGravity(Gravity.CENTER_VERTICAL);
            overdue.setMinimumHeight(dp(44));
            action(overdue, title, () -> open.accept("/app/statements?status=overdue"));
            add(hero, overdue, 4);
        }
        add(page, hero, 16);
        add(page, button(text(R.string.record_lesson), () -> open.accept("/app/lessons/new"), true), 12);
        if (data.schedule() != null) add(page, schedule(data.schedule(), open), 16);

        LinearLayout unbilled = metric(R.string.unbilled_lessons, money(data.unbilled()), R.drawable.ic_lessons);
        add(unbilled, label(text(R.string.lesson_count, numbers.format(data.unbilledCount())), 12, palette.foreground()), 6);
        LinearLayout received = metric(R.string.received_this_month, money(data.received()), R.drawable.ic_tuition);
        float fontScale = context.getResources().getConfiguration().fontScale;
        if (context.getResources().getConfiguration().screenWidthDp >= 350 && fontScale <= 1.2f) {
            LinearLayout row = new LinearLayout(context);
            row.addView(unbilled, new LinearLayout.LayoutParams(0, -1, 1));
            LinearLayout.LayoutParams right = new LinearLayout.LayoutParams(0, -1, 1);
            right.leftMargin = dp(12);
            row.addView(received, right);
            add(page, row, 12);
        } else {
            add(page, unbilled, 12);
            add(page, received, 12);
        }
        add(page, metric(R.string.active_students, numbers.format(data.students()), R.drawable.ic_students), 12);
        if (data.needsOnboarding()) {
            add(page, button(text(R.string.get_started), () -> open.accept("/onboarding"), false), 8);
        }
        return scroll(page);
    }

    private View schedule(Schedule data, Consumer<String> open) {
        LinearLayout section = column();
        add(section, heading(text(R.string.upcoming_lessons), 22), 0);
        if (data.items().isEmpty()) {
            add(section, label(text(R.string.no_planned_lessons), 14, palette.foreground()), 8);
            return section;
        }
        LinearLayout rows = card(palette.surface(), 16, 14);
        var dateFormat = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
            .withLocale(context.getResources().getConfiguration().getLocales().get(0));
        for (Lesson lesson : data.items()) {
            LinearLayout row = column();
            row.setPadding(0, dp(8), 0, dp(8));
            String name = lesson.name() == null ? text(R.string.group_lesson) : lesson.name();
            String day = data.today().equals(lesson.date()) ? text(R.string.today)
                : LocalDate.parse(lesson.date()).format(dateFormat);
            String time = lesson.time() == null ? text(R.string.time_not_set) : lesson.time();
            String when = day + " · " + time;
            add(row, bold(name + " ›", 15, palette.foreground()), 0);
            add(row, label(when, 13, palette.foreground()), 3);
            row.setMinimumHeight(dp(50));
            action(row, name + ", " + when, () -> open.accept(lesson.path()));
            add(rows, row, 0);
        }
        add(section, rows, 8);
        add(section, button(text(R.string.full_schedule), () -> open.accept("/app/schedule"), false), 6);
        return section;
    }

    View more(Consumer<String> open) {
        LinearLayout page = page();
        add(page, button(text(R.string.classes), () -> open.accept("/app/classes"), false), 0);
        add(page, button(text(R.string.account_settings), () -> open.accept("/app/settings"), false), 10);
        add(page, button(text(R.string.help_support), () -> open.accept("/help"), false), 10);
        return scroll(page);
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
        row.setPadding(dp(4), dp(6), dp(4), dp(5));
        for (Tab tab : Tab.values()) {
            boolean active = tab == selected;
            LinearLayout item = column();
            item.setGravity(Gravity.CENTER);
            item.setMinimumHeight(dp(56));
            item.setSelected(active);
            action(item, text(tab.title), () -> select.accept(tab));
            ImageView icon = icon(tab.icon, active ? palette.onAccent() : palette.foreground());
            if (active) {
                icon.setBackground(shape(palette.accent(), 14));
                icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
                icon.setPadding(dp(10), dp(3), dp(10), dp(3));
            }
            item.addView(icon, new LinearLayout.LayoutParams(dp(active ? 54 : 24), dp(27)));
            TextView title = label(text(tab.title), 11, active ? palette.accent() : palette.foreground());
            title.setGravity(Gravity.CENTER);
            title.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            add(item, title, 4);
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

    private LinearLayout metric(int title, String value, int symbol) {
        LinearLayout metric = card(palette.surface(), 18, 14);
        metric.addView(icon(symbol, palette.accent()), new LinearLayout.LayoutParams(dp(20), dp(20)));
        add(metric, label(text(title), 13, palette.foreground()), 8);
        add(metric, bold(value, 19, palette.foreground()), 5);
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
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? palette.onAccent() : palette.accent());
        button.setMinimumHeight(dp(50));
        button.setBackground(new RippleDrawable(
            ColorStateList.valueOf(0x284b916e),
            shape(primary ? palette.accent() : palette.surface(), 16), null
        ));
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private ScrollView scroll(LinearLayout contents) {
        ScrollView scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(palette.background());
        scroll.addView(contents);
        return scroll;
    }

    private LinearLayout page() {
        LinearLayout page = column();
        page.setPadding(dp(20), dp(14), dp(20), dp(24));
        return page;
    }

    private LinearLayout column() {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    private LinearLayout card(int color, int radius, int padding) {
        LinearLayout card = column();
        card.setBackground(shape(color, radius));
        card.setPadding(dp(padding), dp(padding), dp(padding), dp(padding));
        return card;
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
        label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return label;
    }

    private TextView label(String text, int size, int color) {
        TextView label = new TextView(context);
        label.setText(text);
        label.setTextSize(size);
        label.setTextColor(color);
        return label;
    }

    private String money(long vnd) { return numbers.format(vnd) + " ₫"; }
    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
