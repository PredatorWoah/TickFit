package io.github.predatorwoah.tickfit;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;

/**
 * What the home screen widgets know, kept in the app's private SharedPreferences (it never leaves the phone).
 *
 *   snapshot      the latest numbers the app sent (built in js/widgetdata.js), as JSON
 *   pendingWater  water added with a widget's + button that the app has not picked up yet: {"2026-10-10": 500}
 *
 * The app's own data (in the web view) stays the only source of truth: the widget never edits it. The app
 * takes the pending water the next time it runs and adds it to that day itself.
 */
final class WidgetStore {
    private static final String PREFS = "tickfit_widgets";
    private static final String SNAPSHOT = "snapshot";
    private static final String PENDING_WATER = "pendingWater";
    private static final int MAX_PENDING_ML = 20000;

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Today as "YYYY-MM-DD" in the phone's time zone, the same format the app uses. */
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static synchronized void saveSnapshot(Context c, String json) {
        prefs(c).edit().putString(SNAPSHOT, json).apply();
    }

    /** The latest snapshot, or null if the app has not sent one (or it is damaged). */
    static synchronized JSONObject snapshot(Context c) {
        String s = prefs(c).getString(SNAPSHOT, null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    private static JSONObject parse(String s) {
        try {
            return new JSONObject(s == null ? "{}" : s);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** The + button: remember the water for the app, and show it on the widgets straight away. */
    static synchronized void addWater(Context c, int ml) {
        String day = today();
        SharedPreferences p = prefs(c);
        JSONObject pending = parse(p.getString(PENDING_WATER, "{}"));
        SharedPreferences.Editor edit = p.edit();
        try {
            int now = Math.min(MAX_PENDING_ML, pending.optInt(day, 0) + ml);
            pending.put(day, now);
            edit.putString(PENDING_WATER, pending.toString());
            JSONObject snap = snapshot(c);
            if (snap != null && day.equals(snap.optString("date"))) {
                JSONObject water = snap.optJSONObject("water");
                if (water != null) {
                    water.put("ml", water.optInt("ml", 0) + ml);
                    edit.putString(SNAPSHOT, snap.toString());
                }
            }
        } catch (JSONException ignored) {
            // nothing sensible to do, the tap is simply not counted
        }
        edit.commit();
    }

    /** Hand the pending water to the app and forget it here: {"2026-10-10": 500} as text. */
    static synchronized String takePendingWater(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject pending = parse(p.getString(PENDING_WATER, "{}"));
        JSONObject clean = new JSONObject();
        Iterator<String> keys = pending.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            int ml = pending.optInt(k, 0);
            if (k.matches("\\d{4}-\\d{2}-\\d{2}") && ml > 0) {
                try {
                    clean.put(k, Math.min(ml, MAX_PENDING_ML));
                } catch (JSONException ignored) {
                    // skip this day
                }
            }
        }
        p.edit().remove(PENDING_WATER).commit();
        return clean.toString();
    }
}
