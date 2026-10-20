package io.github.predatorwoah.tickfit;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Updates the app from inside it (js/updater.js), with no trip to GitHub in a browser.
 *
 *   download({ url, sha256 | sumsUrl, name })  fetches a new APK from TickFit's own GitHub releases into the
 *                                              app's cache and checks its SHA-256 fingerprint; a file that does
 *                                              not match is thrown away. "progress" events: { done, total }.
 *   install()                                  hands the checked file to Android's installer. The first time,
 *                                              Android asks once to allow installs from TickFit: that settings
 *                                              page opens and { needsPermission: true } comes back.
 *   canInstall()                               { allowed } whether that permission is already given.
 *   clear()                                    deletes a downloaded update (done after it is installed).
 *
 * Android itself only installs the update over the old app when both are signed with the same key, so even a
 * file that got through would not replace TickFit unless it was really made by TickFit's release build.
 */
@CapacitorPlugin(name = "TickFitUpdate")
public class TickFitUpdatePlugin extends Plugin {
    /** Only files from TickFit's own releases are ever downloaded. */
    static final String ALLOWED = "https://github.com/PredatorWoah/TickFit/releases/download/";
    private static final long MAX_BYTES = 80L * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private volatile boolean busy = false;

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates"); // shared through Capacitor's FileProvider (cache-path)
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "TickFit-update.apk");
    }

    private static boolean isHash(String s) {
        return s != null && s.matches("[0-9a-fA-F]{64}");
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256");
        final String sumsUrl = call.getString("sumsUrl");
        final String name = call.getString("name");
        if (url == null || !url.startsWith(ALLOWED) || !url.endsWith(".apk")) {
            call.reject("That is not a TickFit release file.");
            return;
        }
        if (!isHash(sha) && (sumsUrl == null || !sumsUrl.startsWith(ALLOWED) || name == null)) {
            call.reject("There is no fingerprint to check the download against.");
            return;
        }
        if (busy) {
            call.reject("The update is already downloading.");
            return;
        }
        busy = true;
        new Thread(() -> {
            File out = apkFile();
            File part = new File(out.getPath() + ".part");
            try {
                String want = isHash(sha) ? sha : readSum(sumsUrl, name);
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                HttpURLConnection c = open(url);
                long total = c.getContentLengthLong();
                if (total > MAX_BYTES) throw new IOException("The update is unexpectedly big.");
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    long told = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        done += n;
                        if (done > MAX_BYTES) throw new IOException("The update is unexpectedly big.");
                        md.update(buf, 0, n);
                        os.write(buf, 0, n);
                        if (done - told >= 128 * 1024) {
                            told = done;
                            JSObject p = new JSObject();
                            p.put("done", done);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                } finally {
                    c.disconnect();
                }
                if (!hex(md.digest()).equalsIgnoreCase(want)) throw new IOException("The download did not match its fingerprint, so it was thrown away. Try again.");
                if (out.exists() && !out.delete()) throw new IOException("Could not replace an older download.");
                if (!part.renameTo(out)) throw new IOException("Could not save the update.");
                JSObject ret = new JSObject();
                ret.put("bytes", out.length());
                call.resolve(ret);
            } catch (Exception e) {
                part.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "The download failed. Check the internet connection.");
            } finally {
                busy = false;
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) {
            call.reject("Download the update first.");
            return;
        }
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // Android asks once: "Allow from this source". Open that switch for TickFit; the app tries again on return.
            Intent ask = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            ask.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ask);
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(ret);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        File f = apkFile();
        if (f.exists()) f.delete();
        new File(f.getPath() + ".part").delete();
        call.resolve();
    }

    /** Opens an https URL, following GitHub's redirects to its file servers (https only). */
    private static HttpURLConnection open(String url) throws IOException {
        String at = url;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            if (!at.startsWith("https://")) throw new IOException("Refused a download that was not over https.");
            HttpURLConnection c = (HttpURLConnection) new URL(at).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestProperty("User-Agent", "TickFit-Android");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null) throw new IOException("The download moved without saying where.");
                at = new URL(new URL(at), next).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("The download failed (" + code + "). Try again later.");
            }
            return c;
        }
        throw new IOException("The download was redirected too many times.");
    }

    /** The fingerprint for `name` from a release's SHA256SUMS.txt ("<hash>  <file name>" lines). */
    private static String readSum(String sumsUrl, String name) throws IOException {
        HttpURLConnection c = open(sumsUrl);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream in = c.getInputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                bytes.write(buf, 0, n);
                if (bytes.size() > 64 * 1024) throw new IOException("The fingerprint list is unexpectedly big.");
            }
        } finally {
            c.disconnect();
        }
        for (String line : new String(bytes.toByteArray(), StandardCharsets.UTF_8).split("\n")) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length == 2 && isHash(parts[0]) && parts[1].replace("*", "").equals(name)) return parts[0];
        }
        throw new IOException("This release has no fingerprint for " + name + ".");
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }
}
