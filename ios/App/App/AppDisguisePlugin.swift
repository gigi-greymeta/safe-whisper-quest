import UIKit
import Capacitor

/// Switches the home-screen icon between Phantom and the disguises (alternate app icons
/// AppIcon-Calculator / -Notes / -Weather in Assets.xcassets). iOS always shows its own
/// "You have changed the icon" alert, and the name under the icon can't change.
@objc(AppDisguisePlugin)
public class AppDisguisePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppDisguisePlugin"
    public let jsName = "AppDisguise"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCurrent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    private static let disguises = ["calculator", "notes", "weather"]

    private static func iconName(for id: String) -> String {
        "AppIcon-" + id.prefix(1).uppercased() + id.dropFirst()
    }

    @objc func getCurrent(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let name = UIApplication.shared.alternateIconName
            let id = Self.disguises.first { Self.iconName(for: $0) == name } ?? "default"
            call.resolve(["id": id])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? "default"
        guard id == "default" || Self.disguises.contains(id) else {
            call.reject("Unknown disguise: \(id)")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("This device doesn't support changing the app icon.")
                return
            }
            let name = id == "default" ? nil : Self.iconName(for: id)
            if UIApplication.shared.alternateIconName == name {
                call.resolve()
                return
            }
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve()
                }
            }
        }
    }
}
