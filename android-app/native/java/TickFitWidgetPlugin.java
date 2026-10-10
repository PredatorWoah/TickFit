package io.github.predatorwoah.tickfit;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge between the app (JavaScript, js/widgets.js) and the home screen widgets.
 *
 *   update({ data })   the app sends fresh numbers; every widget is redrawn
 *   takeWater()        the app collects water added with a widget's + button: { water: '{"2026-10-10":500}' }
 *   "open" event       a widget was tapped: { screen: "today" | "workout" | "meals" }
 */
@CapacitorPlugin(name = "TickFitWidget")
public class TickFitWidgetPlugin extends Plugin {
    private static final int MAX_SNAPSHOT_CHARS = 100000;

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty() || data.length() > MAX_SNAPSHOT_CHARS) {
            call.reject("No widget data");
            return;
        }
        WidgetStore.saveSnapshot(getContext(), data);
        TickFitWidgets.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeWater(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("water", WidgetStore.takePendingWater(getContext()));
        call.resolve(ret);
    }

    /** Called for the intent that started the app and for every later one (a widget tap while the app is open). */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;
        String screen = intent.getStringExtra(TickFitWidgets.EXTRA_SCREEN);
        if (screen == null) return;
        intent.removeExtra(TickFitWidgets.EXTRA_SCREEN); // so turning the phone doesn't open it again
        JSObject ret = new JSObject();
        ret.put("screen", screen);
        notifyListeners("open", ret, true); // kept until the app is listening
    }
}
