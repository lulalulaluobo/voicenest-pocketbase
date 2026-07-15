package fun.lucc.voicenest;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename");
        if (data == null || filename == null) {
            call.reject("缺少文件内容或文件名");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "writeFile");
    }

    @ActivityCallback
    private void writeFile(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消保存");
            return;
        }

        Uri target = result.getData().getData();
        String data = call.getString("data");
        if (data == null) {
            call.reject("文件内容丢失");
            return;
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(target)) {
            if (output == null) {
                call.reject("无法写入所选位置");
                return;
            }
            output.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) {
            call.reject("保存文件失败", error);
        }
    }
}
