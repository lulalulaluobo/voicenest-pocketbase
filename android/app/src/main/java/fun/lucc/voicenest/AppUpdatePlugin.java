package fun.lucc.voicenest;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String API_URL = "https://api.github.com/repos/lulalulaluobo/voicenest-pocketbase/releases/latest";
    private static final String DOWNLOAD_PREFIX = "https://github.com/lulalulaluobo/voicenest-pocketbase/releases/download/";
    private static final int MAX_METADATA_BYTES = 128 * 1024;
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    private ReleaseUpdate available;

    @PluginMethod
    public void check(PluginCall call) {
        new Thread(() -> {
            try {
                available = fetchUpdate();
                JSObject result = new JSObject();
                result.put("available", available != null);
                if (available != null) result.put("versionName", available.versionName);
                call.resolve(result);
            } catch (Exception error) { call.reject("无法检查更新，请检查网络后重试。", error); }
        }).start();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        new Thread(() -> {
            try {
                if (available == null) available = fetchUpdate();
                if (available == null) throw new Exception("当前已是最新版本。");
                File apk = downloadAndVerify(available);
                getActivity().runOnUiThread(() -> install(apk));
                call.resolve();
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        }).start();
    }

    private ReleaseUpdate fetchUpdate() throws Exception {
        HttpURLConnection connection = open(API_URL);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        try {
            if (connection.getResponseCode() / 100 != 2) throw new Exception("GitHub Release 不可用。");
            JSONObject release = new JSONObject(readLimited(connection.getInputStream(), MAX_METADATA_BYTES));
            String tag = release.optString("tag_name");
            if (!tag.matches("^v\\d+\\.\\d+\\.\\d+$")) return null;
            JSONArray assets = release.optJSONArray("assets");
            if (assets == null) return null;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject asset = assets.getJSONObject(i);
                String name = asset.optString("name");
                if (!name.matches("^VoiceNest-v\\d+\\.\\d+\\.\\d+-\\d+-release\\.apk$")) continue;
                String[] parts = name.substring("VoiceNest-v".length(), name.length() - "-release.apk".length()).split("-");
                int versionCode = Integer.parseInt(parts[1]);
                String url = asset.optString("browser_download_url");
                String expectedUrl = DOWNLOAD_PREFIX + tag + "/" + name;
                String digest = asset.optString("digest");
                if (versionCode <= getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionCode || !url.equals(expectedUrl) || !digest.matches("^sha256:[0-9a-fA-F]{64}$")) continue;
                return new ReleaseUpdate(parts[0], versionCode, name, url, digest.substring(7).toLowerCase());
            }
            return null;
        } finally { connection.disconnect(); }
    }

    private File downloadAndVerify(ReleaseUpdate update) throws Exception {
        HttpURLConnection connection = open(update.url);
        try {
            if (connection.getResponseCode() / 100 != 2 || connection.getContentLengthLong() > MAX_APK_BYTES) throw new Exception("更新包下载失败。");
            File directory = new File(getContext().getCacheDir(), "updates");
            if (!directory.exists() && !directory.mkdirs()) throw new Exception("无法创建更新目录。");
            File apk = new File(directory, update.name);
            File part = new File(directory, update.name + ".part");
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part)) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_APK_BYTES) throw new Exception("更新包过大。");
                    sha256.update(buffer, 0, count); output.write(buffer, 0, count);
                }
            }
            if (!hex(sha256.digest()).equals(update.sha256)) { part.delete(); throw new Exception("更新包 SHA-256 校验失败。"); }
            if (apk.exists()) apk.delete();
            if (!part.renameTo(apk)) throw new Exception("无法准备更新包。");
            verifyArchive(apk, update);
            return apk;
        } finally { connection.disconnect(); }
    }

    private void verifyArchive(File apk, ReleaseUpdate update) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) throw new Exception("更新包不是有效的 APK。");
        PackageInfo installed = manager.getPackageInfo(getContext().getPackageName(), flags);
        long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? archive.getLongVersionCode() : archive.versionCode;
        if (!getContext().getPackageName().equals(archive.packageName) || code != update.versionCode || !signature(archive).equals(signature(installed))) throw new Exception("更新包的包名、版本或签名不匹配。");
    }

    private void install(File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            getContext().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private HttpURLConnection open(String value) throws Exception { HttpURLConnection c = (HttpURLConnection) new URL(value).openConnection(); c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(true); return c; }
    private String readLimited(InputStream input, int max) throws Exception { java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count; while ((count = input.read(buffer)) != -1) { if (output.size() + count > max) throw new Exception("更新信息过大。"); output.write(buffer, 0, count); } return output.toString("UTF-8"); }
    private String signature(PackageInfo info) throws Exception { android.content.pm.Signature[] values = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.signingInfo.getApkContentsSigners() : info.signatures; return hex(MessageDigest.getInstance("SHA-256").digest(values[0].toByteArray())); }
    private String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte value : bytes) out.append(String.format("%02x", value)); return out.toString(); }
    private static class ReleaseUpdate { final String versionName, name, url, sha256; final int versionCode; ReleaseUpdate(String v, int c, String n, String u, String s) { versionName=v; versionCode=c; name=n; url=u; sha256=s; } }
}
