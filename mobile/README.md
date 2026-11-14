# LessonBrook for iOS and Android

The iOS and Android apps have native sign-in screens, a Dashboard and a bottom tab bar with Dashboard, Students, Classes, Lessons, and Statements. The Students, Lessons, Tuition, Classes, and account workflows open the existing LessonBrook screens inside the app. Both apps use the same accounts, server APIs, lesson data, theme preferences, and English and Vietnamese options as the web app. The ledger needs an internet connection.

Dashboard shows the current outstanding, unbilled, received, and student totals. Pull down to refresh on iOS or use the refresh button on Android. Open the gear in the header for account settings and language. Use the palette button beside it to choose and save a theme.

On the welcome screen, **View demo** opens all five tabs with fictional students, classes, lessons, and statements, without signing in. Demo edits stay in the current app view and reset when the web view reloads. **Sign in** returns to native sign-in. Demo actions never modify an account.

Phone layouts use compact cards, form spacing, and controls across all themes. Native tabs sit outside the scrollable page; the last row remains reachable above the tab bar.

Tap the outstanding or overdue amount to open the corresponding statement filter. Upcoming lessons shows planned lessons and weekly class slots from today through seven days ahead. Set weekly days and times when creating or editing a class. Opening a weekly slot prefills the date and time for a lesson you can save. Open a lesson to update it, or use **View full schedule** for the complete date range.

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
3. For data export or account deletion, use the link in **Account settings** to open the web tools in your browser. The browser may ask you to sign in again.

The app keeps a random verifier in memory. The server ties the browser handoff to a hash of that verifier, expires the code after two minutes, and consumes it once. The browser link carries the handoff code. The HTTPS exchange returns the usual HttpOnly session cookie. Expired handoffs are removed in bounded batches on subsequent sign-ins. Sign-in uses the existing Firebase Google provider and server credentials. Dashboard uses that same session cookie to load the latest totals from the server.

## Bank transfer notifications

1. In **Account settings → Bank transfer details**, select the bank and save the account number and holder name. When you issue a statement, LessonBrook saves a copy of these details on it. The statement and its shared link show a VietQR for the outstanding amount with the exact transfer reference as the payment memo.
2. In the same section, create a Shortcut key for the saved account. Confirm with the same Google account, then copy the **Authorization** value. Create a new key when the receiving account changes. The server renews the Firebase session when a notice arrives after expiry. Creating a new key or disconnecting disables the previous key. If a connection still shows an expiry date, select **Enable automatic renewal** and paste its current **Authorization** value to keep the same key.
3. In Apple Shortcuts, add **Get Contents of URL** with the URL shown in settings and choose **POST**. Add the **Authorization** header with the copied value and set **Request Body** to **JSON**. Add a text field named `message` with the full notification as its value.

Techcombank notifications can start with the credited amount. This example uses fictional data.

```text
+ VND 30,000
Account: 12345678901234
Balance: 50,000
DEMO SENDER CC-2026-000001-4EA8C340B1 transfer
```

The account-first format is also supported.

```text
Account 12345678901234
Amount: + 30,000
Balance: 50,000
DEMO SENDER CC-2026-000001-4EA8C340B1 transfer
```

Only a credit to the configured account with one matching reference and an exact outstanding amount is recorded. A retry returns `duplicate`. If the notification includes only the sender's name and a generic transfer description, the API returns `missing_reference` for a matching account. Check the transaction details for the statement reference and ask the payer to keep it in the transfer memo. The received date uses Vietnam time when the notice is processed. Enter cash payments using **Record payment** on the statement.

For SMS or email, choose the relevant Apple Shortcuts trigger and restrict the sender to your bank. App push notifications may need to be copied or shared into the Shortcut. See [Apple’s communication triggers](https://support.apple.com/en-ae/guide/shortcuts/apdd711f9dff/ios) and [sending API requests from Shortcuts](https://support.apple.com/en-lb/guide/shortcuts/apd58d46713f/ios).

## Use your own deployment

The checked-in mobile sources use `https://chotcong.devoralabs.tech`. To run a fork, deploy the web app with your own HTTPS `APP_ORIGIN` and authorized Firebase Auth domain. Change the origin in both `MobileSignIn` files. If you change the callback scheme, update it in both native apps, their platform manifests, and `src/domain/mobile-sign-in.ts`. For a fork distributed alongside LessonBrook, use your own iOS bundle identifier and Android application ID.

The build instructions produce development builds. App Store and Google Play distribution require signed release builds and review.
