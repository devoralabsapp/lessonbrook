import FirebaseAuth
import FirebaseCore
import GoogleSignIn
import UIKit

@MainActor
enum NativeGoogleSignIn {
    private enum Failure: Error { case missingGoogleToken }
    private(set) static var isConfigured = false

    static func configure() {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: path),
              options.bundleID == Bundle.main.bundleIdentifier,
              let clientID = options.clientID,
              let urlTypes = Bundle.main.infoDictionary?["CFBundleURLTypes"] as? [[String: Any]]
        else { return }
        let scheme = clientID.split(separator: ".").reversed().joined(separator: ".")
        let schemes = urlTypes.compactMap { $0["CFBundleURLSchemes"] as? [String] }.flatMap { $0 }
        guard schemes.contains(scheme) else { return }

        FirebaseApp.configure(options: options)
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        try? Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
        isConfigured = true
    }

    static func handle(_ url: URL) -> Bool {
        isConfigured && GIDSignIn.sharedInstance.handle(url)
    }

    static func firebaseIDToken(presenting controller: UIViewController) async throws -> String? {
        let google = GIDSignIn.sharedInstance
        let auth = Auth.auth()
        defer {
            try? auth.signOut()
            google.signOut()
        }
        do {
            let result = try await google.signIn(withPresenting: controller)
            guard let idToken = result.user.idToken?.tokenString else { throw Failure.missingGoogleToken }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString
            )
            let firebase = try await auth.signIn(with: credential)
            return try await firebase.user.getIDToken()
        } catch let error as NSError where error.domain == kGIDSignInErrorDomain
            && error.code == GIDSignInError.canceled.rawValue {
            return nil
        }
    }
}
