import Foundation
import WebKit
import Capacitor

/// Panic wipe, native side: removes all WebKit website data (caches, local storage,
/// IndexedDB, cookies), the shared URL cache, and the contents of the Caches and tmp
/// folders. The app's own data has already been erased; the app reloads afterwards.
@objc(DeviceWipePlugin)
public class DeviceWipePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceWipePlugin"
    public let jsName = "DeviceWipe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "wipeCaches", returnType: CAPPluginReturnPromise)
    ]

    @objc func wipeCaches(_ call: CAPPluginCall) {
        URLCache.shared.removeAllCachedResponses()

        let fm = FileManager.default
        let dirs = [fm.temporaryDirectory] + fm.urls(for: .cachesDirectory, in: .userDomainMask)
        for dir in dirs {
            let items = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
            for item in items {
                try? fm.removeItem(at: item)
            }
        }

        DispatchQueue.main.async {
            WKWebsiteDataStore.default().removeData(
                ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                modifiedSince: .distantPast
            ) {
                call.resolve()
            }
        }
    }
}
