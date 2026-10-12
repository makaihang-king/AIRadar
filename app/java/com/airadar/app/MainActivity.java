package com.airadar.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.IDN;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

/**
 * AI雷达 AIRadar — 原生 WebView 壳。
 * 页面资源从 assets/webapp 通过虚拟主机 https://appassets.local/ 提供；
 * 外部抓取一律走 /__proxy?url=...，由 NetProxy 做严格的 SSRF 防护。
 */
public class MainActivity extends Activity {

    private static final String TAG = "AIRadar";
    private static final String VIRTUAL_HOST = "appassets.local";
    private static final String ASSET_ROOT = "webapp";
    private static final long MAX_BODY_BYTES = 8L * 1024 * 1024; // 单响应上限 8MB
    private static final int MAX_REDIRECTS = 5;

    private WebView web;
    private final ExecutorService netExec = Executors.newCachedThreadPool();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        setupWebView();
        web.loadUrl("https://" + VIRTUAL_HOST + "/index.html");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setLoadsImagesAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportZoom(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " AIRadar/1.0");
        web.setBackgroundColor(0xFF0B1020);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!VIRTUAL_HOST.equals(uri.getHost())) {
                    return null; // 不拦截外部地址（页面本不会直接请求外网）
                }
                String path = uri.getPath();
                if (path != null && path.startsWith("/__proxy")) {
                    String target = uri.getQueryParameter("url");
                    if (target == null || target.isEmpty()) {
                        return plainResponse(400, "text/plain", "missing url param".getBytes());
                    }
                    return NetProxy.fetch(target);
                }
                return serveAsset(path);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                // 只允许站内导航；其余（http/https/mailto 等）交给系统
                if (("https".equals(scheme) || "http".equals(scheme))
                        && VIRTUAL_HOST.equals(uri.getHost())) {
                    return false;
                }
                openExternal(uri);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                Log.d(TAG, "[js] " + cm.message() + " (" + cm.sourceId() + ":" + cm.lineNumber() + ")");
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AIRadarNative");
    }

    /** 打开外部链接（浏览器/系统应用） */
    private void openExternal(Uri uri) {
        try {
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme) && !"mailto".equals(scheme)) {
                return;
            }
            Intent it = new Intent(Intent.ACTION_VIEW, uri);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Exception e) {
            toast("没有可打开此链接的应用");
        }
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        netExec.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ============================ 静态资源 ============================

    private WebResourceResponse serveAsset(String rawPath) {
        String path = rawPath == null ? "/" : rawPath;
        if (path.equals("/") || path.isEmpty()) path = "/index.html";
        path = path.substring(1); // 去掉开头 /
        path = path.split("\\?")[0].split("#")[0];
        // 防目录穿越
        if (path.contains("..") || path.contains("\\")) {
            return plainResponse(403, "text/plain", "forbidden".getBytes());
        }
        if (path.isEmpty()) path = "index.html";
        try {
            InputStream in = getAssets().open(ASSET_ROOT + "/" + path);
            String mime = guessMime(path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            WebResourceResponse resp = new WebResourceResponse(mime, "utf-8", in);
            resp.setResponseHeaders(headers);
            return resp;
        } catch (IOException e) {
            // SPA 路由回退到 index.html
            try {
                InputStream in = getAssets().open(ASSET_ROOT + "/index.html");
                return new WebResourceResponse("text/html", "utf-8", in);
            } catch (IOException ignored) {
                return plainResponse(404, "text/plain", "not found".getBytes());
            }
        }
    }

    private static WebResourceResponse plainResponse(int status, String mime, byte[] body) {
        WebResourceResponse resp = new WebResourceResponse(mime, "utf-8",
                new ByteArrayInputStream(body));
        resp.setStatusCodeAndReasonPhrase(status, status == 200 ? "OK" : "Err");
        return resp;
    }

    static String guessMime(String path) {
        String p = path.toLowerCase(Locale.US);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    // ============================ JS 桥 ============================

    private class Bridge {
        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(() -> {
                try {
                    Uri uri = Uri.parse(url);
                    String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                    if (!"https".equals(scheme) && !"http".equals(scheme)) return;
                    openExternal(uri);
                } catch (Exception e) {
                    toast("链接无效");
                }
            });
        }

        @JavascriptInterface
        public void share(final String title, final String url) {
            runOnUiThread(() -> {
                try {
                    Intent it = new Intent(Intent.ACTION_SEND);
                    it.setType("text/plain");
                    it.putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title);
                    it.putExtra(Intent.EXTRA_TEXT, (title == null ? "" : title + "\n") + (url == null ? "" : url));
                    startActivity(Intent.createChooser(it, "分享"));
                } catch (Exception e) {
                    toast("分享失败");
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg == null ? "" : msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String version() {
            return "1.0.0";
        }

        @JavascriptInterface
        public void clearCache() {
            runOnUiThread(() -> {
                web.clearCache(true);
                toast("缓存已清理");
            });
        }

        /**
         * AI 概括用的 POST 代理（异步）：后台线程执行，完成后经
         * window.__nativeHttpPostDone(json) 回调 JS。
         * 同样走 NetProxy.validate（仅公网 http/https，拒绝本机/内网）。
         */
        @JavascriptInterface
        public void httpPost(final String id, final String urlSpec,
                             final String headersJson, final String body) {
            netExec.execute(() -> {
                String cb;
                try {
                    NetProxy.HttpResult r = NetProxy.postJson(urlSpec, headersJson, body);
                    cb = cbJson(id, r.code, r.body);
                } catch (NetProxy.Rejected e) {
                    cb = cbJson(id, -1, "blocked: " + e.getMessage());
                } catch (Exception e) {
                    cb = cbJson(id, -1, e.getClass().getSimpleName() + ": " +
                            String.valueOf(e.getMessage()).substring(0, Math.min(120, String.valueOf(e.getMessage()).length())));
                }
                final String js = "window.__nativeHttpPostDone && window.__nativeHttpPostDone(" + cb + ");";
                runOnUiThread(() -> {
                    try { web.evaluateJavascript(js, null); } catch (Exception ignored) { }
                });
            });
        }
    }

    /** 回调 JSON（值经 JSONObject.quote 转义，防注入） */
    private static String cbJson(String id, int code, String body) {
        return "{\"id\":" + org.json.JSONObject.quote(id) +
                ",\"code\":" + code +
                ",\"body\":" + org.json.JSONObject.quote(body == null ? "" : body) + "}";
    }

    // ============================ 安全代理 ============================

    /**
     * 出网代理：仅 http/https；拒绝 localhost/环回/内网/保留/链路本地地址；
     * 只允许 80/443 端口；重定向逐跳重新校验；响应体限流。
     */
    static final class NetProxy {

        static WebResourceResponse fetch(String urlSpec) {
            try {
                URL url = validate(urlSpec);
                int redirects = 0;
                while (true) {
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(12_000);
                    conn.setReadTimeout(25_000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 AIRadar/1.0");
                    conn.setRequestProperty("Accept", "*/*");
                    conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
                    conn.setRequestProperty("Accept-Encoding", "gzip");
                    int code = conn.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc == null || ++redirects > MAX_REDIRECTS) {
                            return plainResponse(502, "text/plain", "too many redirects".getBytes());
                        }
                        url = validate(new URL(url, loc).toString()); // 逐跳校验
                        continue;
                    }
                    InputStream raw = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    if (raw == null) {
                        byte[] msg = ("upstream " + code).getBytes();
                        conn.disconnect();
                        return plainResponse(code >= 400 ? code : 502, "text/plain", msg);
                    }
                    if ("gzip".equalsIgnoreCase(conn.getContentEncoding())) {
                        raw = new GZIPInputStream(raw);
                    }
                    final java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                    byte[] chunk = new byte[16384];
                    long total = 0;
                    int n;
                    while ((n = raw.read(chunk)) > 0) {
                        total += n;
                        if (total > MAX_BODY_BYTES) { // 限流，防超大响应拖垮应用
                            raw.close();
                            conn.disconnect();
                            return plainResponse(502, "text/plain", "response too large".getBytes());
                        }
                        buf.write(chunk, 0, n);
                    }
                    raw.close();
                    byte[] body = buf.toByteArray();
                    String mime = conn.getContentType();
                    if (mime == null || mime.isEmpty()) mime = guessMime(url.getPath() == null ? "" : url.getPath());
                    conn.disconnect();
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("X-Proxy-Status", String.valueOf(code));
                    WebResourceResponse resp = new WebResourceResponse(mime, "utf-8",
                            new ByteArrayInputStream(body));
                    resp.setStatusCodeAndReasonPhrase(200, "OK"); // 统一 200，业务码放头部
                    resp.setResponseHeaders(headers);
                    return resp;
                }
            } catch (Rejected e) {
                return plainResponse(403, "text/plain", ("blocked: " + e.getMessage()).getBytes());
            } catch (Exception e) {
                return plainResponse(502, "text/plain",
                        ("proxy error: " + e.getClass().getSimpleName()).getBytes());
            }
        }

        /** POST 结果载体（业务状态码 + 文本响应体） */
        static final class HttpResult {
            int code;
            String body;
        }

        /**
         * JSON POST（AI 概括调用）：
         * 仅公网 http/https；请求头白名单只放行 Authorization；请求体上限 1MB；
         * 读超时 90s（大模型生成较慢）；响应体上限 4MB。
         */
        static HttpResult postJson(String urlSpec, String headersJson, String body) throws Exception {
            final URL url = validate(urlSpec);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(12_000);
            conn.setReadTimeout(90_000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 AIRadar/1.0");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Accept-Encoding", "gzip");
            conn.setRequestProperty("Content-Type", "application/json");
            // 头部白名单：仅 Authorization（Bearer Key），其余一律忽略
            try {
                org.json.JSONArray hs = new org.json.JSONArray(headersJson == null ? "[]" : headersJson);
                for (int i = 0; i < hs.length(); i++) {
                    org.json.JSONObject h = hs.optJSONObject(i);
                    if (h == null) continue;
                    if (!"Authorization".equals(h.optString("name"))) continue;
                    String v = h.optString("value", "");
                    if (v.length() > 4096) throw new Rejected("auth header too long");
                    conn.setRequestProperty("Authorization", v);
                }
            } catch (org.json.JSONException ignored) { }
            byte[] out = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
            if (out.length > 1_000_000) throw new Rejected("body too large");
            conn.setFixedLengthStreamingMode(out.length);
            OutputStream os = conn.getOutputStream();
            os.write(out);
            os.close();
            int code = conn.getResponseCode();
            InputStream raw = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = "";
            if (raw != null) {
                if ("gzip".equalsIgnoreCase(conn.getContentEncoding())) raw = new GZIPInputStream(raw);
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384];
                int n;
                long total = 0;
                while ((n = raw.read(chunk)) > 0) {
                    total += n;
                    if (total > 4L * 1024 * 1024) { raw.close(); conn.disconnect(); throw new Rejected("response too large"); }
                    buf.write(chunk, 0, n);
                }
                raw.close();
                text = new String(buf.toByteArray(), StandardCharsets.UTF_8);
            }
            conn.disconnect();
            HttpResult r = new HttpResult();
            r.code = code;
            r.body = text;
            return r;
        }

        /** 校验并解析目标 URL，不合法直接抛 Rejected */
        static URL validate(String urlSpec) throws Rejected {
            final URL url;
            try {
                url = new URL(urlSpec.trim());
            } catch (Exception e) {
                throw new Rejected("bad url");
            }
            String scheme = url.getProtocol();
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                throw new Rejected("scheme not allowed");
            }
            int port = url.getPort();
            if (port != -1 && port != 80 && port != 443) {
                throw new Rejected("port not allowed");
            }
            String host = url.getHost();
            if (host == null || host.isEmpty()) throw new Rejected("no host");
            String h = host.toLowerCase(Locale.US);
            if (h.endsWith(".onion") || h.endsWith(".internal") || h.endsWith(".local")
                    || h.equals("localhost")) {
                throw new Rejected("host not allowed");
            }
            // 域名转 ASCII（防punycode绕过），再解析全部地址逐一校验
            String asciiHost;
            try {
                asciiHost = IDN.toASCII(h);
            } catch (Exception e) {
                throw new Rejected("bad host");
            }
            try {
                InetAddress[] addrs = InetAddress.getAllByName(asciiHost);
                for (InetAddress a : addrs) {
                    if (isBlockedAddress(a)) throw new Rejected("address not allowed");
                }
            } catch (Rejected re) {
                throw re;
            } catch (Exception e) {
                throw new Rejected("dns failed");
            }
            return url;
        }

        /** 环回/私有/保留/链路本地/组播地址一律拒绝 */
        static boolean isBlockedAddress(InetAddress a) {
            return a.isAnyLocalAddress()      // 0.0.0.0 / ::
                    || a.isLoopbackAddress()  // 127/8, ::1
                    || a.isLinkLocalAddress() // 169.254/16, fe80::/10
                    || a.isSiteLocalAddress() // 10/8, 172.16/12, 192.168/16
                    || a.isMulticastAddress()
                    || isUniqueLocal(a);      // fc00::/7
        }

        static boolean isUniqueLocal(InetAddress a) {
            byte[] b = a.getAddress();
            return b.length == 16 && (b[0] & 0xFE) == 0xFC;
        }

        static final class Rejected extends Exception {
            Rejected(String msg) { super(msg); }
        }
    }
}
