package au.com.greymeta.phantom;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppDisguisePlugin.class);
        registerPlugin(DeviceWipePlugin.class);
        super.onCreate(savedInstanceState);
        // Block screenshots, screen recording and the recent-apps thumbnail so
        // decrypted messages and keys are never captured outside the app. Only a build made
        // with phantomAllowScreenCapture=true (see app/build.gradle) leaves capture on.
        if (BuildConfig.BLOCK_SCREEN_CAPTURE) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
    }
}
