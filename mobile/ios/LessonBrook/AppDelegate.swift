import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        NativeGoogleSignIn.configure()
        return true
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let browser = BrowserViewController()

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = WorkspaceNavigationController(rootViewController: browser)
        self.window = window
        window.makeKeyAndVisible()
        open(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        open(contexts)
    }

    private func open(_ contexts: Set<UIOpenURLContext>) {
        for context in contexts where !NativeGoogleSignIn.handle(context.url) {
            browser.finishSignIn(context.url)
        }
    }
}
