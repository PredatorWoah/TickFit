package io.github.predatorwoah.tickfit;

import android.app.Activity;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keeps the screen on while the rest timer is running (js/awake.js), so the phone does not lock between sets.
 *
 *   keepOn({ on })   true: the screen stays on for as long as TickFit is in front. false: back to the system's timeout.
 *
 * It is a window flag, so it needs no permission, and it ends by itself if the app is closed or goes to the background.
 */
@CapacitorPlugin(name = "TickFitScreen")
public class TickFitScreenPlugin extends Plugin {
    @PluginMethod
    public void keepOn(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("No screen");
            return;
        }
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
}
