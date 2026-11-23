package au.com.greymeta.phantom;

import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewDatabase;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Panic wipe, native side: clears the WebView's HTTP cache, history, form data and
 * web storage, all cookies, and the app's cache folders. The app's own data has
 * already been erased by the time this runs; the app reloads straight afterwards.
 */
@CapacitorPlugin(name = "DeviceWipe")
public class DeviceWipePlugin extends Plugin {

    @PluginMethod
    public void wipeCaches(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                webView.clearCache(true);
                webView.clearHistory();
                webView.clearFormData();
            } catch (Exception ignored) {
                // Best effort: carry on with the rest.
            }
            try {
                WebStorage.getInstance().deleteAllData();
                CookieManager cookies = CookieManager.getInstance();
                cookies.removeAllCookies(null);
                cookies.flush();
                WebViewDatabase.getInstance(getContext()).clearHttpAuthUsernamePassword();
            } catch (Exception ignored) {
                // Best effort.
            }
            deleteContents(getContext().getCacheDir());
            File external = getContext().getExternalCacheDir();
            if (external != null) deleteContents(external);
            call.resolve();
        });
    }

    private static void deleteContents(File dir) {
        File[] children = dir == null ? null : dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) deleteContents(child);
            //noinspection ResultOfMethodCallIgnored
            child.delete();
        }
    }
}
