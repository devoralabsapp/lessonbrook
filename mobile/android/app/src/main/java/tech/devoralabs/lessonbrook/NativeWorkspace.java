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
import java.util.Locale;
import java.util.function.Consumer;

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

    NativeWorkspace(Context owner, String locale, Palette palette) {
        Locale language = "vi".equals(locale) ? Locale.forLanguageTag("vi-VN") : Locale.US;
        Configuration configuration = new Configuration(owner.getResources().getConfiguration());
        configuration.setLocale(language);
        context = owner.createConfigurationContext(configuration);
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
        row.setPadding(dp(3), dp(4), dp(3), dp(3));
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
        LinearLayout bar = column();
        View divider = new View(context);
        divider.setBackgroundColor(palette.border());
        bar.addView(divider, new LinearLayout.LayoutParams(-1, dp(palette.outline())));
        bar.addView(row, new LinearLayout.LayoutParams(-1, -2));
        return bar;
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

    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
