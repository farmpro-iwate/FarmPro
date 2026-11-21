import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// Registered only in this bundled iOS application.
final class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FarmProPrintPlugin())
    }
}

@objc(FarmProPrintPlugin)
public final class FarmProPrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FarmProPrintPlugin"
    public let jsName = "FarmProPrint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]
    private var activePrintCall: CAPPluginCall?

    @objc func print(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let webView = self.bridge?.webView,
                  let view = self.bridge?.viewController?.view else {
                call.reject("印刷する画面が見つかりません。")
                return
            }
            guard self.activePrintCall == nil else {
                call.reject("印刷画面を閉じてからお試しください。")
                return
            }
            guard UIPrintInteractionController.isPrintingAvailable else {
                call.reject("この端末では印刷を利用できません。")
                return
            }
            let printer = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = "FarmPro"
            info.outputType = .general
            printer.printInfo = info
            if let html = call.getString("html") {
                guard html.utf8.count <= 4 * 1024 * 1024 else {
                    call.reject("印刷する内容が大きすぎます。期間を絞ってお試しください。")
                    return
                }
                printer.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
            } else {
                printer.printFormatter = webView.viewPrintFormatter()
            }
            self.activePrintCall = call
            let presented = printer.present(
                from: CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1),
                in: view,
                animated: true
            ) { [weak self] _, completed, error in
                self?.activePrintCall = nil
                if let error = error {
                    call.reject("印刷を完了できませんでした。", nil, error)
                } else {
                    call.resolve(["completed": completed])
                }
            }
            if !presented {
                self.activePrintCall = nil
                call.reject("印刷画面を開けませんでした。")
            }
        }
    }
}
