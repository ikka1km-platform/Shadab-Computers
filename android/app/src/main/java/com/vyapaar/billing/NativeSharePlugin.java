package com.vyapaar.billing;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.List;

@CapacitorPlugin(name = "NativeShare")
public class NativeSharePlugin extends Plugin {

    private static final String TAG = "NativeSharePlugin";

    @PluginMethod
    public void shareImage(PluginCall call) {
        String base64Data = call.getString("base64");
        String filename = call.getString("filename", "report.jpg");
        String title = call.getString("title", "Share Report");
        String text = call.getString("text", "");
        String target = call.getString("target", "whatsapp");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("base64 data is required");
            return;
        }

        try {
            // Remove data URI prefix if present
            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }

            byte[] imageBytes = Base64.decode(base64Data, Base64.DEFAULT);

            Context context = getContext();
            File shareDir = new File(context.getCacheDir(), "shared_images");
            if (!shareDir.exists()) {
                shareDir.mkdirs();
            }

            File imageFile = new File(shareDir, filename);
            FileOutputStream fos = new FileOutputStream(imageFile);
            fos.write(imageBytes);
            fos.flush();
            fos.close();

            String authority = context.getPackageName() + ".fileprovider";
            Uri contentUri = FileProvider.getUriForFile(context, authority, imageFile);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("image/jpeg");
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            if (text != null && !text.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            }
            if (title != null && !title.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            }
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            boolean sharedDirectWhatsApp = false;

            if ("whatsapp".equalsIgnoreCase(target)) {
                PackageManager pm = context.getPackageManager();
                boolean hasWhatsApp = isPackageInstalled("com.whatsapp", pm);
                boolean hasWhatsAppBiz = isPackageInstalled("com.whatsapp.w4b", pm);

                if (hasWhatsApp) {
                    shareIntent.setPackage("com.whatsapp");
                    sharedDirectWhatsApp = true;
                } else if (hasWhatsAppBiz) {
                    shareIntent.setPackage("com.whatsapp.w4b");
                    sharedDirectWhatsApp = true;
                }
            }

            if (sharedDirectWhatsApp) {
                try {
                    grantUriPermissions(context, shareIntent, contentUri);
                    getActivity().startActivity(shareIntent);

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("sharedDirectWhatsApp", true);
                    call.resolve(ret);
                    return;
                } catch (Exception ex) {
                    Log.w(TAG, "Direct WhatsApp launch failed, falling back to chooser", ex);
                    shareIntent.setPackage(null);
                    sharedDirectWhatsApp = false;
                }
            }

            // Fallback or generic share target: Android system chooser
            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            grantUriPermissions(context, chooser, contentUri);
            getActivity().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("sharedDirectWhatsApp", false);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "Failed to share image", e);
            call.reject("Failed to share image: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        String base64Data = call.getString("base64");
        String filename = call.getString("filename", "report.jpg");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("base64 data is required");
            return;
        }

        try {
            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }

            byte[] imageBytes = Base64.decode(base64Data, Base64.DEFAULT);
            Context context = getContext();

            String savedLocation = "Pictures/Vyapar";
            Uri savedUri = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Vyapar");

                savedUri = context.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (savedUri != null) {
                    OutputStream os = context.getContentResolver().openOutputStream(savedUri);
                    if (os != null) {
                        os.write(imageBytes);
                        os.flush();
                        os.close();
                    }
                }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Vyapar");
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(imageBytes);
                fos.flush();
                fos.close();
                savedUri = Uri.fromFile(file);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("filename", filename);
            ret.put("uri", savedUri != null ? savedUri.toString() : "");
            ret.put("location", savedLocation);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "Failed to save image", e);
            call.reject("Failed to save image: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text", "");
        String title = call.getString("title", "Share");
        String target = call.getString("target", "all");

        if (text == null || text.isEmpty()) {
            call.reject("text is required");
            return;
        }

        try {
            Context context = getContext();
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, text);
            if (title != null && !title.isEmpty()) {
                intent.putExtra(Intent.EXTRA_SUBJECT, title);
            }

            if ("whatsapp".equalsIgnoreCase(target)) {
                PackageManager pm = context.getPackageManager();
                if (isPackageInstalled("com.whatsapp", pm)) {
                    intent.setPackage("com.whatsapp");
                } else if (isPackageInstalled("com.whatsapp.w4b", pm)) {
                    intent.setPackage("com.whatsapp.w4b");
                }
            }

            Intent chooser = Intent.createChooser(intent, title);
            getActivity().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to share text", e);
            call.reject("Failed to share text: " + e.getMessage(), e);
        }
    }

    private boolean isPackageInstalled(String packageName, PackageManager packageManager) {
        try {
            packageManager.getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private void grantUriPermissions(Context context, Intent intent, Uri uri) {
        List<ResolveInfo> resInfoList = context.getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
        for (ResolveInfo resolveInfo : resInfoList) {
            String packageName = resolveInfo.activityInfo.packageName;
            context.grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
    }
}
