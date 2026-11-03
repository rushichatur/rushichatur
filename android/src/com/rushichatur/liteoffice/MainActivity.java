package com.rushichatur.liteoffice;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the Lite Office web app (bundled in assets/office) in a WebView and adds the
 * phone features a browser can't: "Open with", saving to any folder, sharing and printing.
 */
public class MainActivity extends Activity {
    // Reserved host for serving local app files over https (gives a normal, secure origin).
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";
    static final int REQ_PICK = 1, REQ_SAVE = 2;
    static final long MAX_OPEN_BYTES = 60L * 1024 * 1024;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingSave;
    private boolean pageReady;
    private String pendingJs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xFF1F2328);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);   // needed to read files picked with the system picker
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serve(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation") // the newer overload calls this one on every Android version
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                // Links inside documents open in the phone's browser
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingJs != null) {
                    String js = pendingJs;
                    pendingJs = null;
                    web.evaluateJavascript(js, null);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean images = Arrays.asList(params.getAcceptTypes()).contains("image/*");
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(images ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, images ? "Choose picture" : "Open file"), REQ_PICK);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
        handleIntent(getIntent());
    }

    /* ---------- Serving the bundled web app ---------- */

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "application/javascript");
        MIME.put("css", "text/css");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
    }

    private WebResourceResponse serve(Uri uri) {
        if (!HOST.equals(uri.getHost())) {
            // Nothing outside the app is ever loaded
            return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }
        String path = uri.getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) path = "/index.html";
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open("office" + path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    /* ---------- Files opened from other apps ---------- */

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        intent.setAction(Intent.ACTION_MAIN); // don't reopen the same file after rotation
        final Uri target = uri;
        new Thread(new Runnable() {
            public void run() {
                try {
                    String name = displayName(target);
                    byte[] data = readAll(target);
                    final String js = "window.liteOfficeOpen && liteOfficeOpen("
                            + JSONObject.quote(Base64.encodeToString(data, Base64.NO_WRAP)) + ","
                            + JSONObject.quote(name) + ")";
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (pageReady) web.evaluateJavascript(js, null);
                            else pendingJs = js;
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        public void run() {
                            Toast.makeText(MainActivity.this, "Could not open file: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }).start();
    }

    private String displayName(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            Cursor c = null;
            try {
                c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.close();
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "file";
        // Guess an extension from the type if the name has none
        if (!name.contains(".")) {
            String type = getContentResolver().getType(uri);
            if (type != null) {
                if (type.contains("wordprocessingml")) name += ".docx";
                else if (type.contains("spreadsheetml")) name += ".xlsx";
                else if (type.contains("ms-excel")) name += ".xls";
                else if (type.contains("opendocument.spreadsheet")) name += ".ods";
                else if (type.contains("csv") || type.contains("comma")) name += ".csv";
                else if (type.startsWith("text/")) name += ".txt";
            }
        }
        return name;
    }

    private byte[] readAll(Uri uri) throws IOException {
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) throw new IOException("no data");
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            long total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_OPEN_BYTES) throw new IOException("file is too large");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    /* ---------- JavaScript bridge ---------- */

    class Bridge {
        @JavascriptInterface
        public void saveFile(String base64, final String name, final String mime) {
            pendingSave = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        jsToast("No file manager available to save");
                    }
                }
            });
        }

        @JavascriptInterface
        public void shareFile(String base64, final String name, final String mime) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                String safe = new File(name).getName();
                File f = new File(dir, safe);
                FileOutputStream out = new FileOutputStream(f);
                out.write(Base64.decode(base64, Base64.DEFAULT));
                out.close();
                final Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(safe));
                runOnUiThread(new Runnable() {
                    public void run() {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType(mime);
                        i.putExtra(Intent.EXTRA_STREAM, uri);
                        i.setClipData(ClipData.newRawUri(name, uri));
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, "Share " + name));
                    }
                });
            } catch (IOException e) {
                jsToast("Could not share: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void print(final String title) {
            runOnUiThread(new Runnable() {
                public void run() {
                    PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                    String job = title == null || title.isEmpty() ? "Lite Office" : title;
                    pm.print(job, web.createPrintDocumentAdapter(job), null);
                }
            });
        }
    }

    private void jsToast(final String msg) {
        runOnUiThread(new Runnable() {
            public void run() {
                web.evaluateJavascript("window.Util && Util.toast(" + JSONObject.quote(msg) + ")", null);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            if (fileCallback != null) fileCallback.onReceiveValue(result);
            fileCallback = null;
        } else if (requestCode == REQ_SAVE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            Uri uri = data.getData();
            try {
                OutputStream out = getContentResolver().openOutputStream(uri, "wt");
                if (out == null) throw new IOException("cannot write");
                out.write(bytes);
                out.close();
                jsToast("Saved " + displayName(uri));
            } catch (Exception e) {
                jsToast("Save failed: " + e.getMessage());
            }
        }
    }

    /* ---------- Lifecycle ---------- */

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        // Make sure open work is saved on the device
        web.evaluateJavascript("window.liteOfficePersist && liteOfficePersist()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
