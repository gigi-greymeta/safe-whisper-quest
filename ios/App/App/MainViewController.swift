import UIKit
import Capacitor

/// Bridge view controller that registers the app's own native plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppDisguisePlugin())
        bridge?.registerPluginInstance(DeviceWipePlugin())
        // The page lays itself out around the notch and home indicator (viewport-fit=cover and
        // CSS safe-area insets), so the web view fills the screen without its own insets, and
        // the dark page shows behind the status bar instead of a white strip.
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.isOpaque = false
        webView?.backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.09, alpha: 1)
        view.backgroundColor = webView?.backgroundColor
    }

    /// Phantom is always dark, so the clock and battery are drawn in white.
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
