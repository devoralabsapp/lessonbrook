package tech.devoralabs.lessonbrook;

import android.net.Uri;
import android.util.Base64;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

final class MobileSignIn {
    static final String ORIGIN = "https://chotcong.devoralabs.tech";
    static final String SCHEME = "tech.devoralabs.lessonbrook";
    static final String GUEST_THEME = "chotcong_guest_theme";
    private static final String HOST = Uri.parse(ORIGIN).getHost();
    private static final Pattern PROOF = Pattern.compile("[A-Za-z0-9_-]{43}");

    static final class HttpFailure extends IOException {
        final int status;

        HttpFailure(int status) {
            super("Request failed");
            this.status = status;
        }
    }

    static boolean isFirstParty(Uri url) {
        return "https".equals(url.getScheme()) && HOST.equals(url.getHost())
            && (url.getPort() == -1 || url.getPort() == 443) && url.getUserInfo() == null;
    }

    static String callbackCode(Uri url) {
        if (url == null || !SCHEME.equals(url.getScheme()) || !"finish".equals(url.getEncodedAuthority())
            || !"".equals(url.getPath()) || url.getFragment() != null) return null;
        String query = url.getEncodedQuery();
        if (query == null || !query.startsWith("code=")) return null;
        String code = query.substring("code=".length());
        return PROOF.matcher(code).matches() ? code : null;
    }

    static String newVerifier() {
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        return base64Url(random);
    }

    static Uri browserUrl(String verifier) {
        try {
            byte[] challenge = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Uri.parse(ORIGIN + "/login").buildUpon()
                .appendQueryParameter("mobileChallenge", base64Url(challenge)).build();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    static String exchange(String code, String verifier, String themeCookie) throws IOException, JSONException {
        JSONObject body = new JSONObject().put("code", code).put("verifier", verifier);
        HttpURLConnection request = post("/api/auth/mobile", body, themeCookie == null ? "" : themeCookie);
        try {
            return responseCookie(request, "chotcong_session");
        } finally {
            request.disconnect();
        }
    }

    static JSONObject workspace(String cookies, boolean initialize) throws IOException, JSONException {
        HttpURLConnection request = post("/api/mobile/workspace", new JSONObject().put("initialize", initialize), cookies);
        try {
            return responseJson(request);
        } finally {
            request.disconnect();
        }
    }

    private static HttpURLConnection post(String path, JSONObject body, String cookies) throws IOException, JSONException {
        String csrfCookie;
        String token;
        HttpURLConnection csrf = connect("/api/auth/csrf");
        try {
            csrfCookie = responseCookie(csrf, "chotcong_csrf").split(";", 2)[0];
            try (InputStream csrfBody = csrf.getInputStream()) {
                byte[] data = new byte[512];
                int length = 0;
                int read;
                while (length < data.length && (read = csrfBody.read(data, length, data.length - length)) != -1) {
                    length += read;
                }
                if (length == data.length) throw new IOException("Invalid CSRF response");
                token = new JSONObject(new String(data, 0, length, StandardCharsets.UTF_8)).getString("token");
            }
        } finally {
            csrf.disconnect();
        }

        HttpURLConnection request = connect(path);
        try {
            request.setRequestMethod("POST");
            request.setDoOutput(true);
            request.setRequestProperty("Content-Type", "application/json");
            request.setRequestProperty("Origin", ORIGIN);
            request.setRequestProperty("x-csrf-token", token);
            request.setRequestProperty("Cookie", cookies.isEmpty() ? csrfCookie : csrfCookie + "; " + cookies);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            request.setFixedLengthStreamingMode(payload.length);
            try (var output = request.getOutputStream()) {
                output.write(payload);
            }
            return request;
        } catch (IOException error) {
            request.disconnect();
            throw error;
        }
    }

    static JSONObject get(String path, String cookies) throws IOException, JSONException {
        HttpURLConnection connection = connect(path);
        try {
            if (!cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
            return responseJson(connection);
        } finally {
            connection.disconnect();
        }
    }

    private static JSONObject responseJson(HttpURLConnection connection) throws IOException, JSONException {
        int status = connection.getResponseCode();
        if (status != 200) throw new HttpFailure(status);
        try (InputStream body = connection.getInputStream()) {
            byte[] data = new byte[8192];
            int length = 0;
            int read;
            while (length < data.length && (read = body.read(data, length, data.length - length)) != -1) {
                length += read;
            }
            if (length == data.length) throw new IOException("Invalid workspace response");
            return new JSONObject(new String(data, 0, length, StandardCharsets.UTF_8));
        }
    }

    private static HttpURLConnection connect(String path) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(15_000);
        connection.setUseCaches(false);
        return connection;
    }

    private static String responseCookie(HttpURLConnection response, String name) throws IOException {
        if (response.getResponseCode() != 200) throw new IOException("Sign-in request failed");
        String cookie = response.getHeaderField("Set-Cookie");
        if (cookie == null || !cookie.startsWith(name + "=")) throw new IOException("Missing sign-in cookie");
        String attributes = cookie.toLowerCase(Locale.ROOT);
        if (!attributes.contains("; httponly") || !attributes.contains("; secure") || attributes.contains("; domain=")) {
            throw new IOException("Invalid sign-in cookie");
        }
        return cookie;
    }

    private static String base64Url(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }
}
