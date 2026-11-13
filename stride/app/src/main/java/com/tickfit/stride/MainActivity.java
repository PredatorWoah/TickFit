package com.tickfit.stride;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private WebView view;
    private String pendingExport;
    private static final int IMPORT = 1, EXPORT = 2;
    private static final int LIMIT = 16 * 1024 * 1024;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null) pendingExport = saved.getString("pending");
        getWindow().setStatusBarColor(Color.rgb(10, 14, 24));
        getWindow().setNavigationBarColor(Color.rgb(10, 14, 24));
        view = new WebView(this);
        view.setBackgroundColor(Color.rgb(10, 14, 24));
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView page, android.webkit.WebResourceRequest request) {
                return true;
            }
        });
        view.addJavascriptInterface(new Files(), "StrideFiles");
        setContentView(view);
        view.loadUrl("file:///android_asset/index.html");
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putString("pending", pendingExport);
    }

    public final class Files {
        @JavascriptInterface public void openVideo(String url) {
            android.net.Uri uri = android.net.Uri.parse(url);
            String host = uri.getHost();
            if (!"https".equals(uri.getScheme()) || !java.util.Arrays.asList(
                "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be").contains(host)) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (android.content.ActivityNotFoundException error) {
                    notifyPage("showNotice", "No app is available to open YouTube.");
                }
            });
        }

        @JavascriptInterface public void explain(String key, String request) {
            new Thread(() -> {
                javax.net.ssl.HttpsURLConnection connection = null;
                try {
                    java.net.URL url = new java.net.URL(
                        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
                    connection = (javax.net.ssl.HttpsURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(40000);
                    connection.setRequestProperty("x-goog-api-key", key);
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setDoOutput(true);
                    try (OutputStream stream = connection.getOutputStream()) {
                        stream.write(request.getBytes(StandardCharsets.UTF_8));
                    }
                    int status = connection.getResponseCode();
                    if (status != 200) {
                        final String message = "Gemini returned HTTP " + status + ". Your plan is still available.";
                        runOnUiThread(() -> notifyPage("geminiResult", message));
                        return;
                    }
                    try (InputStream stream = connection.getInputStream()) {
                        ByteArrayOutputStream data = new ByteArrayOutputStream();
                        byte[] bytes = new byte[4096];
                        for (int n; (n = stream.read(bytes)) != -1;) {
                            if (data.size() + n > 1048576) throw new java.io.IOException();
                            data.write(bytes, 0, n);
                        }
                        final String result = new String(data.toByteArray(), StandardCharsets.UTF_8);
                        runOnUiThread(() -> notifyPage("geminiResult", result));
                    }
                } catch (java.io.IOException error) {
                    runOnUiThread(() -> notifyPage("geminiResult", "Could not reach Gemini. Your plan is still available."));
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }, "gemini-request").start();
        }

        @JavascriptInterface public void open() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(intent, IMPORT);
            });
        }

        @JavascriptInterface public void save(String name, String json) {
            runOnUiThread(() -> {
                pendingExport = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(intent, EXPORT);
            });
        }
    }

    private void notifyPage(String function, String text) {
        view.evaluateJavascript("window." + function + "(" + JSONObject.quote(text) + ")", null);
    }

    @Override protected void onActivityResult(int code, int result, Intent intent) {
        super.onActivityResult(code, result, intent);
        try {
            if (result != RESULT_OK || intent == null || intent.getData() == null) return;
            if (code == IMPORT) {
                try (InputStream stream = getContentResolver().openInputStream(intent.getData())) {
                    if (stream == null) throw new java.io.IOException();
                    ByteArrayOutputStream data = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    for (int length; (length = stream.read(chunk)) != -1;) {
                        if (data.size() + length > LIMIT) {
                            notifyPage("showNotice", "Use a TickFit backup under 16 MB.");
                            return;
                        }
                        data.write(chunk, 0, length);
                    }
                    notifyPage("receiveBackup", new String(data.toByteArray(), StandardCharsets.UTF_8));
                }
            } else if (code == EXPORT && pendingExport != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(intent.getData(), "wt")) {
                    if (stream == null) throw new java.io.IOException();
                    stream.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                }
                notifyPage("showNotice", "Workout JSON saved.");
            }
        } catch (java.io.IOException | SecurityException error) {
            notifyPage("showNotice", "Android could not open or save that file.");
        } finally {
            if (code == EXPORT) pendingExport = null;
        }
    }
}
