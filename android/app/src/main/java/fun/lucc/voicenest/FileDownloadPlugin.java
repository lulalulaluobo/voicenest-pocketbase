package fun.lucc.voicenest;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "FileDownload")
public class FileDownloadPlugin extends Plugin {
    private OutputStream output;
    private Uri target;
    private boolean mediaStorePending;

    @PluginMethod
    public void begin(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null || filename.trim().isEmpty()) {
            call.reject("缺少文件名");
            return;
        }
        if (output != null) {
            call.reject("已有导出正在进行");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            openDownloadsStream(call, filename);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "selectExportDestination");
    }

    private void openDownloadsStream(PluginCall call, String filename) {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, call.getString("mimeType", "application/octet-stream"));
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/声笺");
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        target = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (target == null) {
            call.reject("无法创建下载文件");
            return;
        }

        try {
            output = getContext().getContentResolver().openOutputStream(target);
            if (output == null) {
                throw new IllegalStateException("无法写入下载文件");
            }
            mediaStorePending = true;
            call.resolve();
        } catch (Exception error) {
            discardPendingFile();
            call.reject("无法创建下载文件", error);
        }
    }

    @ActivityCallback
    private void selectExportDestination(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消保存");
            return;
        }

        target = result.getData().getData();
        try {
            output = getContext().getContentResolver().openOutputStream(target);
            if (output == null) {
                call.reject("无法写入所选位置");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            discardPendingFile();
            call.reject("无法写入所选位置", error);
        }
    }

    @PluginMethod
    public void append(PluginCall call) {
        String data = call.getString("data");
        if (data == null || output == null) {
            call.reject("导出会话不存在");
            return;
        }

        try {
            output.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) {
            discardPendingFile();
            call.reject("写入备份失败", error);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        if (output == null) {
            call.reject("导出会话不存在");
            return;
        }

        try {
            output.close();
            output = null;
            if (mediaStorePending && target != null) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(target, values, null, null);
            }
            target = null;
            mediaStorePending = false;
            call.resolve();
        } catch (Exception error) {
            discardPendingFile();
            call.reject("完成导出失败", error);
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        discardPendingFile();
        call.resolve();
    }

    private void discardPendingFile() {
        try {
            if (output != null) output.close();
        } catch (Exception ignored) {
        }
        output = null;
        if (mediaStorePending && target != null) {
            getContext().getContentResolver().delete(target, null, null);
        }
        target = null;
        mediaStorePending = false;
    }
}
