# Architecture and business rules

**English** | [Tiếng Việt](ARCHITECTURE.vi.md)

LessonBrook uses Next.js App Router, React, TypeScript, Tailwind 4, Firebase Authentication, and Cloud Firestore. It runs on Node 24, with Webpack for development and production builds. The lockfile pins dependency versions. See [AGENTS.md](../AGENTS.md) for repository rules and [HANDOFF.md](../HANDOFF.md) for the latest recorded checkpoint.

| Directory           | Contents                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `src/app`           | Pages and Node APIs                                                    |
| `src/domain`        | Schemas, money, dates, statements, and export data                     |
| `src/components`    | Workspace shell, navigation, shared forms, Notes/List UI and controls  |
| `src/lib/firebase`  | Client Auth, server Admin, and OIDC/WIF                                |
| `src/lib/server`    | Repositories, sessions, HTTP handling, and transactions                |
| `src/lib/i18n`      | Locale resolution, translation helpers and English dictionary          |
| `src/features`      | Student, class, lesson, statement, payment, and sharing UI             |
| `mobile`            | SwiftUI iOS client, Android shell, build and sign-in configuration     |
| `firebase`          | Rules, indexes, and independent Rules tests                            |
| `tests/integration` | HTTP/backend isolation with two UIDs, transactions, and data workflows |
| `tests/e2e`         | Chromium, real Auth Emulator popups, retries, and reloads              |

## Product name and compatibility

LessonBrook is the product and repository name. Existing `chotcong` data paths, cookie names, demo project IDs and loopback guards remain internal compatibility identifiers. Renaming the product does not migrate or erase stored data; do not change these identifiers solely to rebrand a fork.

## Data boundaries

All business operations go through server APIs. Derive the UID from a revocation-checked Firebase session; never accept browser-supplied owner IDs or document paths. Private data lives under `apps/chotcong/users/{uid}`. Admin SDK bypasses Rules, so backend isolation tests and client Rules tests provide separate evidence.

Session cookies are HttpOnly/Lax, Secure on HTTPS, and last up to five days. Browser Auth uses memory persistence: exchange a recent-auth ID token for a server cookie, then sign out the client. Mutations check Origin/CSRF, strict payloads/body limits, and UUID idempotency keys. Do not cache session verification between requests or store tokens/tuition data in browser storage or logs.

## Request paths

- Signed-in web screens mount under the server layout in `src/app/app/layout.tsx`. Workspace components call `src/lib/client-api.ts`, which attaches CSRF and idempotency headers to mutations. The Node handler in `src/app/api/[...path]/route.ts` verifies the session and passes the server-derived UID to repositories in `src/lib/server/`. Domain validation and calculations live in `src/domain/`.
- `/demo` reuses the workspace pages and components. `src/components/workspace-link.tsx` maps workspace navigation to demo routes, and `src/lib/demo-api.ts` sends commands to `/api/demo` without account cookies. The Node handler builds a fictional ledger and replays a bounded history from the browser tab using `src/features/demo/workspace.ts`. Changes are held in tab memory until reload. When a change affects both modes, keep their filters, validation and results consistent.
- A recipient opens `/s` with a share token in the URL fragment. The page posts the token to `/api/share/resolve`, which verifies the link and returns an allowlisted statement. The server keeps only the token hash. Public rendering uses the statement palette.
- The iOS app uses SwiftUI throughout (`LessonBrookApp`, per-tab `NavigationStack`, native directories/editors/calendars/statements/settings). It has no embedded WebView. Android retains native sign-in, Dashboard and tab navigation with WebView ledger screens. The native Dashboard fetches its data and syncs due class slots through `/api/mobile/workspace`. The Upcoming lessons screen uses `/api/mobile/schedule`. Browser-based sign-in hands off a short-lived, verifier-bound, single-use code to `/api/auth/mobile` to establish the same HTTP session. Configured iOS builds can use native Google sign-in. See [the mobile guide](../mobile/README.md) for platform setup.
- The signed-in iOS and Android Dashboards mirror the mobile demo's compact summary cards and student-style schedule rows. The native screens continue to render the verified workspace snapshot, and the demo continues to use fictional data scoped to its tab. Native sign-in and the mobile browser handoff use the same compact card hierarchy and keep the existing platform-specific authentication flows.

## Ledger workflow

1. Create a student and optionally add them to classes. The student form collects identity and contact details. A single lesson takes its own rate, and a class lesson uses the class rate. Saved lessons keep their price snapshots.
2. The Lessons tab at `/app/sessions` lists per-student attendance and tuition rows. A shared group or class lesson at `/app/lessons/[id]` holds common lesson information and links those rows. Recording a group or class lesson writes one row per selected participant. Bulk completion applies to selected eligible planned rows.
3. The statement editor selects completed, chargeable, unlocked attendance for one student. Issuance saves the statement snapshots and locks those attendance rows. Amendments and voids handle lesson locks in the same transaction as statement changes.
4. A teacher records or adjusts a payment from the statement. The payment transaction updates the amount received, which drives paid/unpaid labels in Lessons and Statements. Issued statements can produce expiring share links. Optional Gmail delivery uses the active link and saved recipient, is gated by the verified-teacher whitelist, and can embed a VietQR for an unpaid balance with bank details. The email captures the balance at send time. See [Deployment](DEPLOYMENT.md#optional-statement-email-through-gmail).

## Invariants

- Money uses safe integer VND; business dates use YYYY-MM-DD in Vietnam. System Timestamps are generated on the server and documents carry schemaVersion.
- Changing a student's or class's default rate does not alter saved lessons. Classes support up to 50 students, charging only selected participants; each student has separate tuition rows and statements.
- Transactions read before writing. Create result IDs outside callbacks, which may retry. The same payload and request ID return the same result; a different payload with that ID is rejected.
- Statements contain at most 100 eligible lessons. Issuing a statement commits snapshots, counters and billedStatementId locks in one transaction. Existing drafts do not create receivables. An issued statement without active payments can be amended in place, with changes to the total and lesson locks committed together. Its number and bank snapshot remain fixed. Cancellation requires an empty payment history, including voided entries, and releases the lessons and revokes the share link in the same transaction.
- Payments cannot exceed the outstanding balance. Editing or voiding updates the statement total received in the same transaction. Voiding a payment preserves its history. Recording or editing a payment to settle the balance revokes the active share and clears its pointer in that payment transaction. Voiding a payment later leaves the revoked link inactive.
- Share links use random tokens in the `/s#token` fragment. The browser sends a POST body and the server stores only a hash. Sharing checks the statement version and supports expiry, rotation, revocation, and a public response allowlist. Public resolution also checks the statement still has a balance, including for older statements. Never log tokens, cookies, or headers.
- Export pages share a server readTime; ZIP/CSV exports are not Firestore backups. Account deletion is a state machine with leases/checkpoints and write/link locks. Never delete real accounts for testing.

## Appearance preferences

A home page theme selection is kept in a short-lived cookie and rendered on the sign-in page. After verifying a recent Google ID token, the session endpoint applies the validated selection to that account in the profile transaction and clears the cookie. Sign-ins without a selection keep the stored preference.

The application shell holds a preview from the header picker separately from the saved account preference. Save commits it through the authenticated, idempotent appearance endpoint. Cancel, dismissing the picker, route navigation and reload restore the saved preference. Shared statements keep an explicit light palette.

Retro component styles are scoped to `data-theme="playful-retro"` and exclude the `data-theme="statement"` boundary. Palette, border and shadow tokens live in globals.css; shared cards can opt into `data-tone="yellow|pink|blue|mint"`. Buttons expose their existing variant as data for theme styling. Nunito is bundled under SIL OFL 1.1 via next/font/local, with preloading disabled so unused themes do not preload it.

English is the default locale. The translation helpers in `src/lib/i18n/` resolve the locale and map source strings through `src/lib/i18n/en.json`. Keep labels and messages available in both English and Vietnamese. The locale does not change Vietnam business dates or the VND currency.

## Workspace lists and calendars

`src/components/workspace.tsx` drives Dashboard, Students, student ledgers, and the Lessons tab. Class and Statement lists live in `src/features/classes/list.tsx` and `src/features/statements/list.tsx`. The four directory tabs reuse `RecordViewSwitch` and `RecordNote`. Notes are the default and preserve the same actions and filters as List. Classes and Lessons also offer a month calendar. `RecordIdentity` is shared by Students and Classes. Its name frame uses theme tokens and the surrounding note has a lighter tint. Lesson and Statement notes have their own styles.

Statements use the same directory card structure: the list title and view switch sit in its header, filters follow, and results stay inside the card. List mode uses compact rows with separators and a right-aligned amount and status; Notes keep their pinned paper layout. Loading, empty, error and pagination states also stay inside the directory card.

One shared IntersectionObserver pauses note animation outside the viewport, and a visibility listener pauses it when the document is hidden. Notes pivot around their pin. Keyboard focus and pointer hover use short, small transforms. Reduced motion disables these effects. The shaded red SVG pins use a small contact shadow at the base to suggest a pin inserted into the paper. Observer subscriptions are released when notes unmount.

Phone layouts use `.record-note-people` for compact two-column Students and Classes notes, independently of the wider Lesson and Statement notes. The Lessons actions are Today, This month, Clear filters and Select in one row. Bulk completion controls sit underneath. The native and mobile demo Dashboards present Upcoming lessons in one directory card with framed identities, initial badges and dividers like the Student list.

The main Lessons and Statements tabs default to the current month in Vietnam. Lessons filter by lesson date and Statements by issue date, falling back to creation date in Vietnam. Dashboard billing/status links and student ledgers use all dates by default so older balances remain visible. Clearing the Lessons filters or choosing **All time** in Statements is the path to earlier records from those tabs. Dashboard totals retain their own reporting rules.

Workspace directories request Vietnamese alphabetical ordering for students and the next weekly slot for classes, with unscheduled classes last. Lesson lists request ascending date/time order, placing untimed lessons last within their day. The API sorts before pagination, binds cursors to the owner and filters, and holds the class schedule reference time across pages. Date ordering uses the existing date index and completes boundary days to keep equal-date lessons in time order. Note grids follow row-major reading order.

Monthly calendars reuse the authenticated list APIs and follow every pagination cursor, including empty filtered pages. The Classes calendar projects saved weekly timetables and excludes archived classes. The Lessons calendar shows recorded sessions for the selected month and filters, grouping attendance rows by lesson ID. Date-only calendar arithmetic uses UTC to avoid browser timezone shifts. Class times remain Vietnam times.

Classes and Lessons share the same seven-column month grid across desktop, phone browsers and the Android WebView. The SwiftUI iOS calendar implements the same month/day-agenda model against the existing APIs; classes project weekly slots and group attendance rows collapse to one lesson event. Day cells show the first two events with their calendar colors and a count for additional events. At phone widths the time and event title stack and long titles truncate in the grid. Selecting the day shows the full linked agenda below.

Weekly class slots use Vietnam time. The upcoming schedule projects the next seven days. While the signed-in workspace is open, it checks for due slots and records them as planned lessons with one row per active participant. It catches up when the teacher returns. A saved class lesson at the same time takes precedence. A planned lesson enters billing after the teacher marks it complete and chargeable. The manifest provides a launch shortcut.

## Bank transfer reconciliation

Issuing a statement freezes the configured bank details on that statement. The teacher and the recipient can scan the same VietQR while there is an outstanding balance. The app renders it locally with the outstanding amount and a transfer reference that fits the NAPAS 25-character memo field. Existing issued statements retain their transfer references and any legacy text instructions.

After recording a partial cash payment, the API can send a balance update through the same Gmail account after returning the saved payment. This requires an active share previously delivered by email, VietQR details, and the same verified recipient address. The update uses the current remaining balance and the original transfer reference. It contains a new token tied to the active share and its expiry, so both links stop working when the parent share is rotated or revoked. The recipient fingerprint and update claim guard against address changes and duplicate sends. For legacy emails, a student edit after the original send was attempted makes the recipient uncertain and skips the automatic follow-up. Gmail delivery failures leave the saved payment intact. An ambiguous send result retains the claim.

An optional iPhone Shortcut can forward incoming bank notices. Its scoped key unlocks an encrypted Firebase session that the server verifies for revocation on every request. The user can confirm with Google to enable renewal on demand. Firebase refresh credentials are encrypted with the Shortcut key and stored only on the server. Disconnecting deletes the connection. Revoked Firebase credentials require reconnection. The payment transaction checks the connection again and matches the receiving account on the statement, a unique issued-statement reference, and the full outstanding balance. The server retains the normal transfer record and idempotency hash, without the notice text or bank balance.

The notification entry point is `/api/bank-notifications`. Parsing lives in `src/domain/bank-notification.ts`. Shortcut authorization lives in `src/lib/server/bank-shortcut.ts`, and the payment record is committed by `src/lib/server/payments-repository.ts`. The parser accepts account-first notices and Techcombank notices that start with `+ VND`. It reads the credited amount separately from the balance and accepts the supported compact reference when separators have been removed. Notices without a unique reference return `missing_reference` when the account matches and leave the ledger unchanged.

## Workspace read cache

Authenticated workspace reads use a bounded, 45-second cache in Node process memory. Keys include the Firebase project and database, UID, reader, filters, cursor, Vietnam business date, and the relevant data revisions. Class lists also key by minute for next-slot ordering. A cold instance or expired entry reads Firestore and fills the cache. Concurrent requests for the same key in an instance share one origin read.

After checking Firebase session revocation, the API reads the maintenance lock, account deletion control, and workspace revisions in one Firestore batch. Business transactions write revisions in `users/{uid}/preferences/workspace-cache` along with affected records. A committed revision changes the logical cache key immediately, even on a different instance. An older in-flight read can only fill its old key. Old entries expire from memory or are evicted by the size limit. An idempotent replay or failed transaction does not advance a revision.

The read and write dependency maps are in `src/lib/server/workspace-cache.ts`. The shared `operation` transaction handles normal mutations including cash and Shortcut payments. Profile creation and guest theme changes, shared link creation, and scheduled lesson creation write revisions in their own transactions. Keep revision writes in the same transaction when adding a business mutation. Direct Admin edits outside the application can remain stale until the short TTL expires.

Session verification, sharing authorization, bank Shortcut credentials, exports, and mutations use their existing direct reads. The demo is independent. Private HTTP responses still use `no-store` for browsers and CDNs. No additional caching service or client storage is required.

The same server cache serves the native mobile APIs and embedded workspace screens. The browser client coalesces overlapping GET requests in a bounded RAM registry and drops entries when they settle; every later read still contacts the server. Starting and finishing a mutation clears the registry, so a pre-write read cannot be reused by a post-write request. Completed tuition responses are not stored in browser storage. Classes and Statements keep their current rows while the same filter is revalidated, but changing a filter hides the old result; pagination waits for the new response.

Native iOS/Android retain an account-local Dashboard snapshot and mounted content in RAM. Returning to Dashboard, refreshing, resuming and periodic checks still validate with the server. Equal snapshots reuse the existing view and scroll position; data, theme or locale changes update it. Sign-out and demo entry clear this memory. There is no persistent offline tuition cache. Native cache/rendering changes require installing a rebuilt app.

## Verification boundaries

Keep Firestore Rules tests separate from backend isolation tests because Admin SDK bypasses Rules. The Emulator suite covers both and runs browser tests against a demo build. Hosted public smoke checks verify public routes and anonymous access controls. Cloud indexes, IAM, real Google OAuth, authenticated cloud flows and installation on real devices need separate validation. Prepaid packages and multi-staff permissions are outside the current scope.

## SwiftUI iOS client

The entry point is `mobile/ios/LessonBrook/AppDelegate.swift` (a SwiftUI `App`, despite the historical filename). `WorkspaceStore` owns the authentication phase, Keychain session, current snapshot/theme/locale, demo replay and bounded RAM page cache. `MobileSignIn` reuses one ephemeral URLSession, refuses cross-origin API URLs/redirects, sends explicit cookies, obtains CSRF credentials and supplies mutation idempotency keys. No Firebase database SDK is used by business screens. The Google/Firebase Auth SDK is only used for authentication and reauthentication; its presenter bridge uses UIKit because the SDK requires a view controller. All application screens are SwiftUI.

`LedgerRecord`/`LedgerValue` preserve JSON integer VND and nullable/legacy fields without coercion. `LedgerDate` pins dates, week boundaries, times and calendar projection to Vietnam. `LedgerDirectory`, `LedgerEditors`, `LedgerRecordDetail`, `LedgerMonth`, `NativeStatementDetail` and `NativeSettings` share one store and palette. UI filters are query-keyed, old filter results disappear during a new request, cursors are bounded/deduplicated, and server locks remain authoritative.

Directory pages live for 20 seconds, at most 32 keys; inflight reads are coalesced. Successful writes invalidate all native directory pages after server commit, increment a view revision and cancel old fills. Generation/revision checks reject fills from an earlier session or write. Snapshot changes also invalidate pages, including incoming Shortcut payments observed on refresh. There is no durable offline ledger or local optimistic mutation queue. A retry with the same unresolved mutation body keeps its idempotency key; successful operations release that key. Sign-out/demo transitions clear all account-local RAM. The server session is Keychain-only and the URLSession has no disk response cache or automatic cookie storage.

Demo reads and mutations replay `/api/demo` commands without account cookies. Native preview stays inside the demo. Actual sharing/email continues to call the existing authenticated statement APIs; email allowlists and Gmail credentials stay on the server. QR payload generation has a golden parity test against the server's NAPAS/VietQR bytes and recalculates the remaining balance after payments. Cash edits, payment removal, cancellation, share revocation and incoming bank transfers retain the existing transaction/cache contracts.

The app refreshes the workspace on foreground activation, Dashboard return and a 60-second foreground timer; the open statement checks every 30 seconds. Scheduled lessons materialize while the app is open, as authorized by the maintainer. It does not request a background scheduler. SwiftUI lays out the tab content and themed bottom bar as separate rows. Dynamic Type and VoiceOver remain available without webpage pinch zoom. Unsaved editors retain their tab stack and confirm explicit discard; saving blocks duplicate actions/navigation.

### iOS visual parity with the original workspace

`WorkspaceDesign.swift` implements SwiftUI versions of the existing web cards, fields, selects, checkboxes, dates and buttons. Keep the design aligned with `globals.css`, `record-note.tsx`, `record-view-switch.tsx`, `record-form.tsx` and the class/statement list components. `Nunito-Variable.ttf` and its OFL license are copied from the existing web asset into the iOS bundle. Theme colors and outlines remain shared through `WorkspacePalette`. No HTML, CSS or embedded browser is used to render the native screens.

The directory heading sits above the enclosing list card. The card contains its title, icon view switch, filters and results, separated by dividers. Student and class Notes use the original two-column paper layout, a framed initial/name/contact identity, and direct underlined Edit/Archive actions. A UTF-16, wrapping 31-based ID hash chooses the same six paper colors as the web. Lesson notes keep the month/day badge, student/class links, date/time and amount/duration lines, then centered lesson status, payment status and Edit controls. Statement notes retain period, issue/due dates and the amount with Paid/Unpaid underneath. List mode uses compact tinted rows with separators.

The custom theme header is a sibling of each tab's NavigationStack and supplies the title and back action for pushed screens. The tab bar occupies a separate row below the tab content so the scroll viewport ends above it. Modal editors use the original framed header/body/footer hierarchy with labeled controls and native SwiftUI selection/date sheets. Do not replace them with default grouped Form/List layouts or segmented view pickers. The workspace's cache, session and tab-stack model remains intact. Student selectors and class-filter loaders observe the store revision so an invalidated inflight read restarts instead of leaving a cancelled selector empty.

The shared month grid sets equal tile heights and one device pixel of spacing. `WorkspacePalette.calendarSelection` supplies a bright fill with dark ink in every theme. `WorkspaceOptionPanel` and `WorkspaceOptionRow` style both regular and searchable student dropdowns; pickers keep their existing selection bindings. Class and custom group checklists use the shared active student loader. They include archived students only if those students were selected in the original record. The bank Shortcut form keeps the newly generated key in view state until its sheet closes and groups ongoing actions below a separate connection summary.

The SwiftUI student, class and lesson forms follow the mobile web order and size their dialog to the content up to the available viewport. Class and custom group editors keep a bounded scrolling roster with a search, selection count and removable selected names. Single-lesson search sits above its student picker. The SwiftUI time picker presents hour and minute columns in Vietnam time and commits the selection with Done. Form errors, discard prompts and calendar notices use the active theme. The framed month views in Classes and Lessons open on the current month and retain the previous/next arrows.

Students and Classes share their row actions between the pinned cards and List. The List actions sit to the right of the framed identity. The class detail uses the existing class endpoint for the roster and weekly schedule, and pages through the class-scoped group lessons endpoint for its inline history. Each calendar groups filtered attendance rows into one agenda item per group lesson, with participant counts and distinct statuses. The final week shares the same continuous grid border. The Upcoming lessons page uses the complete ordered schedule and identifies recurring entries by the route containing their day and time. The Dashboard keeps its shorter preview.

For visual checks, use `/demo` at a phone viewport with the previous native user-agent flags (`LessonBrookApp/iOS NativeWorkspace/1 NativeChrome/1`) as the reference, then compare the SwiftUI demo at the same width. Check the original List and Notes layouts, date/select sheets, edit actions, English/Vietnamese, all six themes and the light recipient preview. The native UI suite includes a layout/direct-action contract and captures reference screenshots; generated images remain outside Git.
