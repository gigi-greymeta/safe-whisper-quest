package au.com.greymeta.phantom;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Switches the home-screen icon and name between Phantom and the disguises by
 * enabling exactly one launcher activity-alias (see AndroidManifest.xml).
 */
@CapacitorPlugin(name = "AppDisguise")
public class AppDisguisePlugin extends Plugin {

    private static final String[] DISGUISES = { "default", "calculator", "notes", "weather" };

    private ComponentName aliasFor(String id) {
        String suffix = Character.toUpperCase(id.charAt(0)) + id.substring(1);
        return new ComponentName(getContext(), getContext().getPackageName() + ".Launcher" + suffix);
    }

    private boolean isEnabled(PackageManager pm, String id) {
        int state = pm.getComponentEnabledSetting(aliasFor(id));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return id.equals("default");
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    @PluginMethod
    public void getCurrent(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String current = "default";
        for (String id : DISGUISES) {
            if (isEnabled(pm, id)) {
                current = id;
                break;
            }
        }
        JSObject result = new JSObject();
        result.put("id", current);
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String target = call.getString("id", "default");
        boolean known = false;
        for (String id : DISGUISES) known |= id.equals(target);
        if (!known) {
            call.reject("Unknown disguise: " + target);
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        // Enable the new entry before disabling the old one so there is always a launcher entry.
        pm.setComponentEnabledSetting(aliasFor(target), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String id : DISGUISES) {
            if (!id.equals(target)) {
                pm.setComponentEnabledSetting(aliasFor(id), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
        }
        call.resolve();
    }
}
