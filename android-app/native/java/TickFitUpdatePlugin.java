package io.github.predatorwoah.tickfit;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
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
import java.io.FileInputStream;
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
 *   download({ url, sha256 | sumsUrl, name })  fetches a new APK from TickFit's own GitHub releases with
 *                                              Android's DownloadManager and checks its SHA-256 fingerprint; a
 *                                              file that does not match is thrown away. "progress" events:
 *                                              { done, total }. Gives up with a message after a minute without
 *                                              progress, so it can never hang.
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
    private static final long STALL_MS = 60000; // a download with no progress for a minute is given up
    private volatile boolean busy = false;

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates"); // shared through Capacitor's FileProvider (cache-path)
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "TickFit-update.apk");
    }

    private static boolean isHash(String s) {
        return s != null && s.matches("[0-9a-fA-F]{64}");
    }

    /**
     * The download itself is done by Android's DownloadManager (the system service behind the phone's own
     * downloads): it follows GitHub's redirects, copes with a flaky network, shows the usual download
     * notification, and keeps going if TickFit is closed. TickFit only watches it, then checks the result.
     */
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
            DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            long id = -1;
            File got = null;
            try {
                if (dm == null) throw new IOException("This phone has no download service.");
                String want = isHash(sha) ? sha : readSum(sumsUrl, name);
                File dir = getContext().getExternalFilesDir("updates");
                if (dir == null) throw new IOException("There is no room to save the update.");
                if (!dir.exists()) dir.mkdirs();
                got = new File(dir, "TickFit-download.apk");
                if (got.exists()) got.delete();
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setTitle("TickFit update");
                req.setDescription(name != null ? name : "New version");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                req.setDestinationInExternalFilesDir(getContext(), "updates", "TickFit-download.apk");
                req.addRequestHeader("User-Agent", "TickFit-Android");
                id = dm.enqueue(req);

                long started = System.currentTimeMillis();
                long lastBytes = -1;
                long lastMove = started;
                while (true) {
                    Thread.sleep(400);
                    long done = 0;
                    long total = -1;
                    int status;
                    int reason = 0;
                    try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                        if (c == null || !c.moveToFirst()) throw new IOException("The download was cancelled.");
                        status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    }
                    long now = System.currentTimeMillis();
                    if (done != lastBytes) {
                        lastBytes = done;
                        lastMove = now;
                        JSObject p = new JSObject();
                        p.put("done", done);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                    if (total > MAX_BYTES || done > MAX_BYTES) throw new IOException("The update is unexpectedly big.");
                    if (status == DownloadManager.STATUS_SUCCESSFUL) break;
                    if (status == DownloadManager.STATUS_FAILED) throw new IOException(failReason(reason));
                    // nothing moving for a long while: say so instead of waiting forever
                    if (now - lastMove > STALL_MS) throw new IOException(done > 0 ? "The download stopped. Check the internet connection and try again." : "The download did not start. Check the internet connection and try again.");
                }

                // check the fingerprint, then keep the file where the installer can be given it
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try (InputStream in = new FileInputStream(got)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
                }
                if (!hex(md.digest()).equalsIgnoreCase(want)) throw new IOException("The download did not match its fingerprint, so it was thrown away. Try again.");
                File out = apkFile();
                if (out.exists() && !out.delete()) throw new IOException("Could not replace an older download.");
                try (InputStream in = new FileInputStream(got); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                }
                JSObject ret = new JSObject();
                ret.put("bytes", out.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "The download failed. Check the internet connection.");
            } finally {
                // the checked copy lives in the cache now: drop the download (and its entry in the phone's list)
                if (dm != null && id != -1) dm.remove(id);
                if (got != null && got.exists()) got.delete();
                busy = false;
            }
        }).start();
    }

    private static String failReason(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                return "The phone is out of space for the update. Free some up and try again.";
            case DownloadManager.ERROR_HTTP_DATA_ERROR:
            case DownloadManager.ERROR_CANNOT_RESUME:
                return "The connection dropped during the download. Try again.";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS:
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE:
                return "GitHub did not hand over the file. Try again in a few minutes.";
            default:
                return reason >= 400 && reason < 600 ? "GitHub answered " + reason + ". Try again in a few minutes." : "The download failed. Check the internet connection and try again.";
        }
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
