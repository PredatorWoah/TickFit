package io.github.predatorwoah.tickfit;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * TickFit's six home screen widgets. Each one only places text and numbers that the app already worked out
 * (js/widgetdata.js), so the logic lives in one place and is tested there.
 *
 *   Ring    2x2  today's ring, streak and the day's name
 *   Today   4x2  ring, workout row, calories, protein and water
 *   NextUp  4x1  the next exercise, with a live workout clock
 *   Water   2x1  water so far, and a + button that adds a glass
 *   Week    4x1  streak and this week's days
 *   Lifted  2x2  kg lifted this week, compared with something Indian
 *
 * Tapping a widget opens the app on the right screen. Nothing here can crash the home screen: a problem
 * shows a small "Open TickFit" message instead.
 */
public final class TickFitWidgets {
    static final String EXTRA_SCREEN = "tickfit_screen";
    static final String ACTION_ADD_WATER = "io.github.predatorwoah.tickfit.ADD_WATER";
    static final String ACTION_REFRESH = "io.github.predatorwoah.tickfit.REFRESH_WIDGETS";
    static final int WATER_STEP_ML = 250;

    private static final Class<?>[] ALL = { Ring.class, Today.class, NextUp.class, Water.class, Week.class, Lifted.class };

    private TickFitWidgets() {}

    /** The common part: draw every instance, and redraw when it is resized. */
    public abstract static class Base extends AppWidgetProvider {
        abstract RemoteViews build(Context c, JSONObject s);

        RemoteViews safeBuild(Context c) {
            try {
                JSONObject s = WidgetStore.snapshot(c);
                if (s == null) return message(c, "Open TickFit once to set up this widget");
                if (!WidgetStore.today().equals(s.optString("date"))) return message(c, "Tap to load today in TickFit");
                return build(c, s);
            } catch (Exception e) {
                return message(c, "Tap to open TickFit");
            }
        }

        @Override
        public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
            RemoteViews views = safeBuild(c);
            for (int id : ids) {
                try {
                    manager.updateAppWidget(id, views);
                } catch (RuntimeException ignored) {
                    // a launcher refusing one update must not stop the rest
                }
            }
            scheduleMidnight(c);
        }

        @Override
        public void onAppWidgetOptionsChanged(Context c, AppWidgetManager manager, int id, android.os.Bundle options) {
            try {
                manager.updateAppWidget(id, safeBuild(c));
            } catch (RuntimeException ignored) {
                // same as above
            }
        }

        @Override
        public void onReceive(Context c, Intent intent) {
            if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
                updateAll(c);
                return;
            }
            super.onReceive(c, intent);
        }
    }

    /**
     * Redraw every widget just after midnight, so they switch to the new day (the snapshot already holds it)
     * without waiting for Android's half-hourly update. Inexact on purpose: no special permission, battery friendly.
     */
    static void scheduleMidnight(Context c) {
        AlarmManager alarms = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        java.util.Calendar at = java.util.Calendar.getInstance();
        at.add(java.util.Calendar.DAY_OF_YEAR, 1);
        at.set(java.util.Calendar.HOUR_OF_DAY, 0);
        at.set(java.util.Calendar.MINUTE, 0);
        at.set(java.util.Calendar.SECOND, 30);
        Intent i = new Intent(c, Ring.class);
        i.setAction(ACTION_REFRESH);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, at.getTimeInMillis(), pi);
    }

    public static class Ring extends Base {
        @Override
        RemoteViews build(Context c, JSONObject s) {
            return ring(c, s);
        }
    }

    public static class Today extends Base {
        @Override
        RemoteViews build(Context c, JSONObject s) {
            return today(c, s);
        }
    }

    public static class NextUp extends Base {
        @Override
        RemoteViews build(Context c, JSONObject s) {
            return nextUp(c, s);
        }
    }

    public static class Water extends Base {
        @Override
        RemoteViews build(Context c, JSONObject s) {
            return water(c, s);
        }

        @Override
        public void onReceive(Context c, Intent intent) {
            if (intent != null && ACTION_ADD_WATER.equals(intent.getAction())) {
                WidgetStore.addWater(c, WATER_STEP_ML);
                updateAll(c);
                return;
            }
            super.onReceive(c, intent);
        }
    }

    public static class Week extends Base {
        @Override
        RemoteViews build(Context c, JSONObject s) {
            return week(c, s);
        }
    }

    public static class Lifted extends Base {
        @Override
        RemoteViews build(Context c, JSONObject s) {
            return lifted(c, s);
        }
    }

    /** Redraw every TickFit widget on the home screen. */
    static void updateAll(Context c) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        for (Class<?> cls : ALL) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(c, cls));
            if (ids == null || ids.length == 0) continue;
            try {
                Base provider = (Base) cls.getDeclaredConstructor().newInstance();
                provider.onUpdate(c, manager, ids);
            } catch (Exception ignored) {
                // one widget failing must not stop the others
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // taps

    /** Open the app on a screen. Each screen gets its own request code so the extras don't mix. */
    private static PendingIntent open(Context c, String screen) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction("io.github.predatorwoah.tickfit.OPEN_" + screen);
        i.putExtra(EXTRA_SCREEN, screen);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, ("open-" + screen).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent addWater(Context c) {
        Intent i = new Intent(c, Water.class);
        i.setAction(ACTION_ADD_WATER);
        return PendingIntent.getBroadcast(c, 250, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---------------------------------------------------------------------------------------------
    // shared pieces

    private static RemoteViews message(Context c, String text) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_message);
        v.setTextViewText(R.id.w_msg, text);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "today"));
        return v;
    }

    /** The day's ring: done and total, with water counted once the widget's + button reaches the target. */
    private static int[] ringNumbers(JSONObject s) {
        JSONObject r = s.optJSONObject("ring");
        if (r == null) return new int[] { 0, 0, 0 };
        int done = r.optInt("done", 0);
        int total = r.optInt("total", 0);
        JSONObject w = s.optJSONObject("water");
        if (r.optBoolean("waterItem") && !r.optBoolean("waterDone") && w != null && w.optInt("target", 0) > 0 && w.optInt("ml", 0) >= w.optInt("target", 0)) done = Math.min(total, done + 1);
        int pct = total > 0 ? Math.round(done * 100f / total) : 0;
        return new int[] { done, total, pct };
    }

    /** The progress ring as a picture, in the theme's colours (widgets can't draw arcs themselves). */
    private static Bitmap ringBitmap(Context c, int sizeDp, int pct) {
        float density = Math.min(3f, c.getResources().getDisplayMetrics().density);
        int px = Math.max(16, Math.round(sizeDp * density));
        Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(b);
        float stroke = px * 7f / 64f;
        float r = px * 26f / 64f;
        float cx = px / 2f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(c.getColor(R.color.tf_track));
        canvas.drawCircle(cx, cx, r, p);
        if (pct > 0) {
            p.setColor(c.getColor(R.color.tf_accent));
            canvas.drawArc(new RectF(cx - r, cx - r, cx + r, cx + r), -90f, 360f * Math.min(100, pct) / 100f, false, p);
        }
        return b;
    }

    private static void ringInto(Context c, RemoteViews v, JSONObject s, int sizeDp, boolean longSub) {
        int[] n = ringNumbers(s);
        v.setImageViewBitmap(R.id.w_ring, ringBitmap(c, sizeDp, n[2]));
        if (n[1] == 0) {
            v.setTextViewText(R.id.w_pct, "Rest");
            v.setTextViewText(R.id.w_sub, "day");
        } else {
            v.setTextViewText(R.id.w_pct, n[2] + "%");
            v.setTextViewText(R.id.w_sub, n[0] + " of " + n[1] + (longSub ? " done" : ""));
        }
    }

    private static void streakInto(RemoteViews v, int id, int streak, String suffix) {
        if (streak > 0) {
            v.setViewVisibility(id, View.VISIBLE);
            v.setTextViewText(id, streak + suffix);
        } else {
            v.setViewVisibility(id, View.GONE);
        }
    }

    /** "1.5", "1.75", "3" */
    private static String litres(int ml) {
        double l = Math.round(ml / 10.0) / 100.0;
        if (l == Math.floor(l)) return String.valueOf((long) l);
        String t = String.valueOf(l);
        return t.endsWith("0") ? t.substring(0, t.length() - 1) : t;
    }

    private static int pct(int a, int b) {
        return b > 0 ? Math.max(0, Math.min(100, Math.round(a * 100f / b))) : 0;
    }

    /** One labelled bar (calories, protein): hidden when the plan has no numbers for it. */
    private static void barInto(RemoteViews v, JSONObject part, int block, int text, int bar) {
        if (part == null) {
            v.setViewVisibility(block, View.GONE);
            return;
        }
        v.setViewVisibility(block, View.VISIBLE);
        v.setTextViewText(text, part.optString("text"));
        v.setProgressBar(bar, 100, part.optInt("pct", 0), false);
    }

    private static void waterBarInto(RemoteViews v, JSONObject s, int block, int text, int bar) {
        JSONObject w = s.optJSONObject("water");
        if (w == null || w.optInt("target", 0) <= 0) {
            v.setViewVisibility(block, View.GONE);
            return;
        }
        v.setViewVisibility(block, View.VISIBLE);
        v.setTextViewText(text, litres(w.optInt("ml", 0)) + " / " + litres(w.optInt("target", 0)) + " L");
        v.setProgressBar(bar, 100, pct(w.optInt("ml", 0), w.optInt("target", 0)), false);
    }

    // ---------------------------------------------------------------------------------------------
    // the widgets

    static RemoteViews ring(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_ring);
        ringInto(c, v, s, 120, false);
        streakInto(v, R.id.w_streak, s.optInt("streak", 0), "");
        v.setTextViewText(R.id.w_label, s.optString("label"));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "today"));
        return v;
    }

    static RemoteViews today(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        ringInto(c, v, s, 104, true);
        streakInto(v, R.id.w_streak, s.optInt("streak", 0), " day streak");
        v.setTextViewText(R.id.w_label, s.optString("label"));
        v.setTextViewText(R.id.w_date, s.optString("dateText"));
        JSONObject wk = s.optJSONObject("workout");
        if (wk != null) {
            String state = wk.optString("state");
            v.setTextViewText(R.id.w_wk_title, wk.optString("title"));
            v.setTextViewText(R.id.w_wk_sub, wk.optString("sub"));
            v.setImageViewResource(R.id.w_wk_icon, "finished".equals(state) || "rest".equals(state) ? R.drawable.ic_w_check : R.drawable.ic_w_play);
        }
        barInto(v, s.optJSONObject("kcal"), R.id.w_kcal_block, R.id.w_kcal_text, R.id.w_kcal_bar);
        barInto(v, s.optJSONObject("protein"), R.id.w_protein_block, R.id.w_protein_text, R.id.w_protein_bar);
        waterBarInto(v, s, R.id.w_water_block, R.id.w_water_text, R.id.w_water_bar);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "today"));
        v.setOnClickPendingIntent(R.id.w_wk_row, open(c, "workout"));
        v.setOnClickPendingIntent(R.id.w_meals, open(c, "meals"));
        return v;
    }

    static RemoteViews nextUp(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_nextup);
        JSONObject wk = s.optJSONObject("workout");
        if (wk == null) wk = new JSONObject();
        String state = wk.optString("state", "rest");
        v.setTextViewText(R.id.w_top, wk.optString("nextTop"));
        v.setTextViewText(R.id.w_name, wk.optString("nextName"));
        v.setTextViewText(R.id.w_detail, wk.optString("nextDetail"));
        v.setTextViewText(R.id.w_sets, wk.optString("setsText"));
        long start = wk.optLong("startMs", 0);
        if ("active".equals(state) && start > 0) {
            // A live clock: the home screen keeps it ticking without waking the app.
            long base = SystemClock.elapsedRealtime() - Math.max(0, System.currentTimeMillis() - start);
            v.setChronometer(R.id.w_clock, base, null, true);
            v.setViewVisibility(R.id.w_clock, View.VISIBLE);
            v.setViewVisibility(R.id.w_time, View.GONE);
        } else {
            v.setChronometer(R.id.w_clock, SystemClock.elapsedRealtime(), null, false);
            v.setViewVisibility(R.id.w_clock, View.GONE);
            v.setViewVisibility(R.id.w_time, View.VISIBLE);
            v.setTextViewText(R.id.w_time, "finished".equals(state) ? wk.optString("timeText", "Done") : "rest".equals(state) ? "Rest" : "Start");
        }
        v.setImageViewResource(R.id.w_icon, "finished".equals(state) || "rest".equals(state) ? R.drawable.ic_w_check : R.drawable.ic_w_play);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "workout"));
        return v;
    }

    static RemoteViews water(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_water);
        JSONObject w = s.optJSONObject("water");
        int ml = w == null ? 0 : w.optInt("ml", 0);
        int target = w == null ? 0 : w.optInt("target", 0);
        v.setTextViewText(R.id.w_amount, litres(ml));
        v.setTextViewText(R.id.w_target, target > 0 ? "/ " + litres(target) + " L" : "L");
        v.setProgressBar(R.id.w_water_bar, 100, pct(ml, target), false);
        v.setViewVisibility(R.id.w_water_bar, target > 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "meals"));
        v.setOnClickPendingIntent(R.id.w_add, addWater(c));
        return v;
    }

    private static final int[] WEEK_LETTERS = { R.id.w_l0, R.id.w_l1, R.id.w_l2, R.id.w_l3, R.id.w_l4, R.id.w_l5, R.id.w_l6 };
    private static final int[] WEEK_DOTS = { R.id.w_d0, R.id.w_d1, R.id.w_d2, R.id.w_d3, R.id.w_d4, R.id.w_d5, R.id.w_d6 };

    private static int dotFor(String state) {
        switch (state) {
            case "full": return R.drawable.widget_dot_full;
            case "part": return R.drawable.widget_dot_part;
            case "missed": return R.drawable.widget_dot_missed;
            case "today": return R.drawable.widget_dot_today;
            case "rest": return R.drawable.widget_dot_rest;
            default: return R.drawable.widget_dot_future;
        }
    }

    static RemoteViews week(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_week);
        v.setTextViewText(R.id.w_streak, String.valueOf(s.optInt("streak", 0)));
        JSONArray days = s.optJSONArray("week");
        for (int i = 0; i < 7; i++) {
            JSONObject d = days == null ? null : days.optJSONObject(i);
            String letter = d == null ? "" : d.optString("l");
            boolean isToday = d != null && d.optBoolean("today");
            v.setTextViewText(WEEK_LETTERS[i], letter);
            v.setTextColor(WEEK_LETTERS[i], c.getColor(isToday ? R.color.tf_text : R.color.tf_muted));
            v.setImageViewResource(WEEK_DOTS[i], dotFor(d == null ? "future" : d.optString("s", "future")));
        }
        v.setOnClickPendingIntent(R.id.w_root, open(c, "today"));
        return v;
    }

    static RemoteViews lifted(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_lifted);
        JSONObject l = s.optJSONObject("lifted");
        if (l == null) l = new JSONObject();
        v.setTextViewText(R.id.w_kg, l.optString("kgText", "0"));
        v.setTextViewText(R.id.w_fact, l.optString("fact"));
        v.setTextViewText(R.id.w_next, l.optString("nextText"));
        v.setProgressBar(R.id.w_bar, 100, l.optInt("pct", 0), false);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "today"));
        return v;
    }
}
