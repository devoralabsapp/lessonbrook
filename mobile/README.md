# LessonBrook for iOS and Android

The iOS and Android apps have native sign-in screens, a Today dashboard, a bottom tab bar, and a More menu. The Students, Lessons, Tuition, Classes, and account workflows open the existing LessonBrook screens inside the app. Both apps use the same accounts, server APIs, lesson data, theme preferences, and English and Vietnamese options as the web app. The ledger needs an internet connection.

Today shows the current outstanding, unbilled, received, and student totals. Pull down to refresh on iOS or use the refresh button on Android. Change language from **More → Account settings** and use the palette button in the workspace header to choose and save a theme. Returning to Today applies the saved preferences to the native screens.

Tap the outstanding or overdue amount to open the corresponding statement filter. Upcoming lessons shows planned lessons from today through seven days ahead. Open a lesson to update it, or use **View full schedule** for the complete date range.

Switching tabs or using the app's Back button while editing a marked form asks whether to keep editing or discard the changes. While a save is in progress, wait for it to finish before leaving.

After reviewing a statement and creating its share link, use **Share via app…** to open the phone's share menu. You choose the destination and send the message there.

## iOS

Open `ios/LessonBrook.xcodeproj` in Xcode 26 or later, choose an iPhone or iPad simulator, and click **Run**. The app targets iOS 16 and later. Xcode resolves Firebase Auth and Google Sign-In via Swift Package Manager. The checked-in project can be regenerated from `ios/project.yml` using XcodeGen 2.46.0.

To run on a physical device, select your Apple development team in **Signing & Capabilities** and use a bundle identifier and callback scheme you control. You can also set `DEVELOPMENT_TEAM` in the ignored file `ios/Config/Signing.local.xcconfig`.

To enable native Google sign-in, register the matching bundle identifier as an iOS app in the Firebase project used by the web deployment. Enable the Google provider and obtain the iOS configuration with its OAuth client ID. Then run this command from the repository root.

```sh
mobile/ios/configure-firebase.sh /path/to/GoogleService-Info.plist
```

The command installs the configuration and callback scheme locally. Without an iOS configuration, the app uses the browser sign-in flow. See [Firebase's Apple sign-in guide](https://firebase.google.com/docs/auth/ios/google-signin).

## Android

Open `android/` in Android Studio, or use the Gradle wrapper with JDK 17 or later, Android SDK 35, and Build Tools 36.0.0. The app targets Android 8.0 and later.

```sh
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Install it through Android Studio or with `adb install -r app/build/outputs/apk/debug/app-debug.apk`. Android release builds need your own signing configuration.

## Sign-in and account settings

On a configured iOS build, tap **Continue with Google** and select your account in the Google sign-in sheet. LessonBrook exchanges the Firebase token for the usual HttpOnly server session and opens the ledger. Android and unconfigured iOS builds use these steps.

1. Tap **Continue with Google** in the app.
2. Finish Google sign-in in the system browser, then tap **Open LessonBrook** to return. If the attempt expires or the app was closed during sign-in, start again from the app.
3. For data export or account deletion, use the link in **More → Account settings** to open the web tools in your browser. The browser may ask you to sign in again.

The app keeps a random verifier in memory. The server ties the browser handoff to a hash of that verifier, expires the code after two minutes, and consumes it once. The browser link carries the handoff code. The HTTPS exchange returns the usual HttpOnly session cookie. Expired handoffs are removed in bounded batches on subsequent sign-ins. Sign-in uses the existing Firebase Google provider and server credentials. Today uses that same session cookie to load the latest totals from the server.

## Bank transfer notifications

1. Sign in, open **Account settings**, and save your bank details. Include them when preparing a statement so the recipient sees the exact transfer reference. You can also copy the reference from the issued statement.
2. In **iPhone payment shortcut**, enter the receiving account number as shown in the bank notification and create a key. Copy the value shown for **Authorization**. Creating a new key or disconnecting disables the previous key. The connection expires with the Firebase session used to create it, up to five days after sign-in.
3. In Apple Shortcuts, add **Get Contents of URL** with the URL shown in settings and choose **POST**. Add the **Authorization** header with the copied value and set **Request Body** to **JSON**. Add a text field named `message` with the full notification as its value.

The currently supported format looks like this fictional example.

```text
Account 12345678901234
Amount: + 30,000
Balance: 50,000
DEMO SENDER CC-2026-000001-4EA8C340B1D2 transfer
```

Only a credit to the configured account with one matching reference and an exact outstanding amount is recorded. A retry returns `duplicate`. An unsupported format, account mismatch, or missing reference returns a status for review. A transfer without a matching statement or amount leaves the ledger for the teacher to reconcile. The received date uses Vietnam time when the notice is processed. Enter cash payments using **Record payment** on the statement.

For SMS or email, choose the relevant Apple Shortcuts trigger and restrict the sender to your bank. App push notifications may need to be copied or shared into the Shortcut. See [Apple’s communication triggers](https://support.apple.com/en-ae/guide/shortcuts/apdd711f9dff/ios) and [sending API requests from Shortcuts](https://support.apple.com/en-lb/guide/shortcuts/apd58d46713f/ios).

## Use your own deployment

The checked-in mobile sources use `https://chotcong.devoralabs.tech`. To run a fork, deploy the web app with your own HTTPS `APP_ORIGIN` and authorized Firebase Auth domain. Change the origin in both `MobileSignIn` files. If you change the callback scheme, update it in both native apps, their platform manifests, and `src/domain/mobile-sign-in.ts`. For a fork distributed alongside LessonBrook, use your own iOS bundle identifier and Android application ID.

The build instructions produce development builds. App Store and Google Play distribution require signed release builds and review.
