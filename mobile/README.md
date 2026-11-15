# LessonBrook for iOS and Android

The iOS app uses SwiftUI for sign-in, all five ledger tabs, record details, editors, month calendars, statements, payments, appearance and account settings. It does not embed the web workspace. Android retains its native sign-in, Dashboard and themed navigation with embedded web ledger screens. Both use the existing Node APIs, server-owned Firebase data, six themes and English/Vietnamese locales. An internet connection is required.

On iOS, each tab keeps a separate navigation stack. Students and Classes offer compact two-column Notes and List views; Classes and Lessons also offer a seven-column month calendar with day agendas. Lessons supports automatic filters, per-student attendance and bulk completion. Statements supports direct issue/edit, VietQR for the remaining balance, sharing, email through the existing server policy, editable cash/transfer history and cancellation when the server permits it. Full payment revokes the share on the server. The detail screen checks for incoming payments every 30 seconds while open.

**View demo** opens all five tabs without signing in. iOS uses the same SwiftUI screens and replays fictional commands through `/api/demo`; edits stay in RAM until sign-out or the next launch. Android uses the web demo. Demo requests carry no account session, and demo previews never publish a live parent payment link.

The themed bottom bar reserves its own safe-area inset below scrollable content. A SwiftUI header reserves space above each tab, and the original workspace headings, enclosing list cards, visible filters, icon view buttons, framed identities, note actions and month/day badges are retained. Forms, selects, dates and checkboxes use the current theme instead of default grouped iOS forms. The bundled Nunito font matches the web Retro and Sticker themes. iOS screens have no WebView pinch zoom; native Dynamic Type and VoiceOver remain available. `WorkspacePalette`, `WorkspacePanel` and the native button/pin styles provide reusable visual tokens. Appearance changes preview immediately; Save persists the choice. Rebuilding and installing is required for every iOS UI change. Web deployment continues to update Android's embedded ledger.

Both apps use the server read cache. iOS additionally keeps a bounded 20-second directory cache and coalesces overlapping reads in RAM. A successful mutation clears cached pages after the server responds. Changed dashboard snapshots, language changes, sign-out and demo entry invalidate that memory. Filters have independent keys and hide obsolete results; late responses cannot repopulate invalidated pages. Pull to refresh forces a server read. Completed tuition responses are never written to disk. The renewable server session cookie is stored in this device's Keychain; authentication remains subject to server revocation checks.

Dashboard shows Outstanding tuition, unbilled lessons, received tuition and active students, followed by Upcoming lessons. Refresh on return, foreground activation and once per minute checks the current server snapshot and materializes due weekly class slots while the app is open. There is no background scheduler while the app is closed.

Editors retain their navigation stack when switching tabs. Cancel/Back asks before discarding a changed form; swipe dismissal is disabled for dirty forms. While a save is in progress, navigation and duplicate saves are blocked. Native share sheets let the teacher choose the destination after creating a statement link. Account settings can export all datasets as JSON and manage account deletion through the existing server workflow.

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
3. iOS account tools use SwiftUI and the same session. Native account deletion and renewable Shortcut setup require the configured Google SDK for reauthentication. Android opens the web account tools in the system browser, which may ask you to sign in again.

The app keeps a random verifier in memory. The server ties the browser handoff to a hash of that verifier, expires the code after two minutes, and consumes it once. The browser link carries the handoff code. The HTTPS exchange returns the usual HttpOnly session cookie. Expired handoffs are removed in bounded batches on subsequent sign-ins. Sign-in uses the existing Firebase Google provider and server credentials. Dashboard uses that same session cookie to load the latest totals from the server.

## Bank transfer notifications

1. In **Account settings → Bank transfer details**, select the bank and save the account number and holder name. When you issue a statement, LessonBrook saves a copy of these details on it. The statement and its shared link show a VietQR for the outstanding amount with the exact transfer reference as the payment memo.
2. In the same section, create a Shortcut key for the saved account. Confirm with the same Google account, then copy the **Authorization** value. Create a new key when the receiving account changes. The server renews the Firebase session when a notice arrives after expiry. Creating a new key or disconnecting disables the previous key. If a connection still shows an expiry date, select **Enable automatic renewal** and paste its current **Authorization** value to keep the same key.
3. In Apple Shortcuts, add **Get Contents of URL** with the URL shown in settings and choose **POST**. Add the **Authorization** header with the copied value and set **Request Body** to **JSON**. Add a text field named `message` with the full notification as its value.

Techcombank notifications can start with the credited amount. This example uses fictional data.

```text
+ VND 30,000
Account: 12345678901234
Balance: VND 50,000
CC20260000014EA8C340B1
```

The account-first format is also supported.

```text
Account 12345678901234
Amount: + 30,000
Balance: 50,000
DEMO SENDER CC-2026-000001-4EA8C340B1 transfer
```

Only a credit to the configured account with one matching reference and an exact outstanding amount is recorded. A retry returns `duplicate`. If the notification includes only the sender's name and a generic transfer description, the API returns `missing_reference` for a matching account. Check the transaction details for the statement reference and ask the payer to keep it in the transfer memo. The received date uses Vietnam time when the notice is processed. Enter cash payments using **Paid by cash** on the statement.

For SMS or email, choose the relevant Apple Shortcuts trigger and restrict the sender to your bank. App push notifications may need to be copied or shared into the Shortcut. See [Apple’s communication triggers](https://support.apple.com/en-ae/guide/shortcuts/apdd711f9dff/ios) and [sending API requests from Shortcuts](https://support.apple.com/en-lb/guide/shortcuts/apd58d46713f/ios).

## Use your own deployment

The checked-in mobile sources use `https://chotcong.devoralabs.tech`. To run a fork, deploy the web app with your own HTTPS `APP_ORIGIN` and authorized Firebase Auth domain. Change the origin in both `MobileSignIn` files. If you change the callback scheme, update it in both native apps, their platform manifests, and `src/domain/mobile-sign-in.ts`. For a fork distributed alongside LessonBrook, use your own iOS bundle identifier and Android application ID.

The build instructions produce development builds. App Store and Google Play distribution require signed release builds and review.

## Verify the SwiftUI app

The Xcode scheme includes `WorkspaceTests` and `WorkspaceUITests`. Choose an installed Simulator destination with `xcrun simctl list devices available`, then run:

```sh
xcodebuild -project mobile/ios/LessonBrook.xcodeproj -scheme LessonBrook \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO test
```

The unit suite checks Vietnam business dates, integer VND decoding, route prefills, server-compatible VietQR payloads, cookies/CSRF/idempotency and page invalidation. The native HTTP integration test only forwards to `127.0.0.1:3000` and Auth Emulator `127.0.0.1:9099`; it skips if the local emulator is absent. Run it against a clean checkout configured with `demo-chotcong`, `APP_ORIGIN=http://localhost:3000`, local Auth/Firestore Emulators and the production-mode Next server. It creates fictional accounts and covers ownership isolation, group attendance, issuing, sharing and the payment lifecycle. Never run emulator tools with hosted Firebase configuration.

UI tests exercise demo creation, search, calendars, lesson/statement/payment forms and all six themes in Vietnamese, and assert that no WebView exists. They require network access to the configured `/api/demo`. Simulator timings include XCTest overhead and are not physical-device performance measurements. Real Google authorization, mailbox delivery, App Store distribution and device installation require separate verification.
