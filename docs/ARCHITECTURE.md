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
| `mobile`            | Native iOS and Android shells, build and sign-in configuration         |
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
- The native apps provide sign-in, a Dashboard and tab navigation. They load workspace routes in a WebView for Students, Classes, Lessons, Statements and settings. The native Dashboard fetches its data and syncs due class slots through `/api/mobile/workspace`. The Upcoming lessons screen uses `/api/mobile/schedule`. Browser-based sign-in hands off a short-lived, verifier-bound, single-use code to `/api/auth/mobile` to establish the same HTTP session. Configured iOS builds can use native Google sign-in. See [the mobile guide](../mobile/README.md) for platform setup.

## Ledger workflow

1. Create a student and optionally add them to classes. The student form collects identity and contact details. A single lesson takes its own rate, and a class lesson uses the class rate. Saved lessons keep their price snapshots.
2. The Lessons tab at `/app/sessions` lists per-student attendance and tuition rows. A shared group or class lesson at `/app/lessons/[id]` holds common lesson information and links those rows. Recording a group or class lesson writes one row per selected participant. Bulk completion applies to selected eligible planned rows.
3. The statement editor selects completed, chargeable, unlocked attendance for one student. Issuance saves the statement snapshots and locks those attendance rows. Amendments and voids handle lesson locks in the same transaction as statement changes.
4. A teacher records or adjusts a payment from the statement. The payment transaction updates the amount received, which drives paid/unpaid labels in Lessons and Statements. Issued statements can produce expiring share links. Optional Gmail delivery uses the active link and saved recipient, is gated by the verified-teacher whitelist, and can embed a VietQR for an unpaid balance with bank details. The email captures the balance at send time. See [Deployment](DEPLOYMENT.md#optional-statement-email-through-gmail).

## Invariants

- Money uses safe integer VND; business dates use YYYY-MM-DD in Vietnam. System Timestamps are generated on the server and documents carry schemaVersion.
- Changing a student's or class's default rate does not alter saved lessons. Classes support up to 50 students, charging only selected participants; each student has separate tuition rows and statements.
- Transactions read before writing. Create result IDs outside callbacks, which may retry. The same payload and request ID return the same result; a different payload with that ID is rejected.
- Statements contain at most 100 eligible lessons. Issuing a statement commits snapshots, counters and billedStatementId locks in one transaction. Existing drafts do not create receivables. An issued statement without active payments can be amended in place, with changes to the total and lesson locks committed together. Its number and bank snapshot remain fixed. Voiding requires no valid payment records.
- Payments cannot exceed the outstanding balance. Editing or voiding updates the statement total received in the same transaction. Voiding preserves history.
- Share links use random tokens in the `/s#token` fragment. The browser sends a POST body; the server stores only a hash. Sharing checks the statement version and supports expiry, rotation, revocation, and a public response allowlist. Never log tokens, cookies, or headers.
- Export pages share a server readTime; ZIP/CSV exports are not Firestore backups. Account deletion is a state machine with leases/checkpoints and write/link locks. Never delete real accounts for testing.

## Appearance preferences

A home page theme selection is kept in a short-lived cookie and rendered on the sign-in page. After verifying a recent Google ID token, the session endpoint applies the validated selection to that account in the profile transaction and clears the cookie. Sign-ins without a selection keep the stored preference.

The application shell holds a preview from the header picker separately from the saved account preference. Save commits it through the authenticated, idempotent appearance endpoint. Cancel, dismissing the picker, route navigation and reload restore the saved preference. Shared statements keep an explicit light palette.

Retro component styles are scoped to `data-theme="playful-retro"` and exclude the `data-theme="statement"` boundary. Palette, border and shadow tokens live in globals.css; shared cards can opt into `data-tone="yellow|pink|blue|mint"`. Buttons expose their existing variant as data for theme styling. Nunito is bundled under SIL OFL 1.1 via next/font/local, with preloading disabled so unused themes do not preload it.

English is the default locale. The translation helpers in `src/lib/i18n/` resolve the locale and map source strings through `src/lib/i18n/en.json`. Keep labels and messages available in both English and Vietnamese. The locale does not change Vietnam business dates or the VND currency.

## Workspace lists and calendars

`src/components/workspace.tsx` drives Dashboard, Students, student ledgers, and the Lessons tab. Class and Statement lists live in `src/features/classes/list.tsx` and `src/features/statements/list.tsx`. The four directory tabs reuse `RecordViewSwitch` and `RecordNote`. Notes are the default and preserve the same actions and filters as List. Classes and Lessons also offer a month calendar. `RecordIdentity` is shared by Students and Classes. Its name frame uses theme tokens and the surrounding note has a lighter tint. Lesson and Statement notes have their own styles.

Statements use the same directory card structure: the list title and view switch sit in its header, filters follow, and results stay inside the card. List mode uses compact rows with separators and a right-aligned amount and status; Notes keep their pinned paper layout. Loading, empty, error and pagination states also stay inside the directory card.

Phone layouts use `.record-note-people` for compact two-column Students and Classes notes, independently of the wider Lesson and Statement notes. In the Lessons filters, Lesson type and Clear filters share a phone row, followed by Today, This month and Select. Desktop controls retain their existing arrangement.

The main Lessons and Statements tabs default to the current month in Vietnam. Lessons filter by lesson date and Statements by issue date, falling back to creation date in Vietnam. Dashboard billing/status links and student ledgers use all dates by default so older balances remain visible. Clearing the Lessons filters or choosing **All time** in Statements is the path to earlier records from those tabs. Dashboard totals retain their own reporting rules.

Workspace directories request Vietnamese alphabetical ordering for students and the next weekly slot for classes, with unscheduled classes last. Lesson lists request ascending date/time order, placing untimed lessons last within their day. The API sorts before pagination, binds cursors to the owner and filters, and holds the class schedule reference time across pages. Date ordering uses the existing date index and completes boundary days to keep equal-date lessons in time order. Note grids follow row-major reading order.

Monthly calendars reuse the authenticated list APIs and follow every pagination cursor, including empty filtered pages. The Classes calendar projects saved weekly timetables and excludes archived classes. The Lessons calendar shows recorded sessions for the selected month and filters, grouping attendance rows by lesson ID. Date-only calendar arithmetic uses UTC to avoid browser timezone shifts. Class times remain Vietnam times.

Weekly class slots use Vietnam time. The upcoming schedule projects the next seven days. While the signed-in workspace is open, it checks for due slots and records them as planned lessons with one row per active participant. It catches up when the teacher returns. A saved class lesson at the same time takes precedence. A planned lesson enters billing after the teacher marks it complete and chargeable. The manifest provides a launch shortcut.

## Bank transfer reconciliation

Issuing a statement freezes the configured bank details on that statement. The teacher and the recipient can scan the same VietQR while there is an outstanding balance. The app renders it locally with the outstanding amount and a transfer reference that fits the NAPAS 25-character memo field. Existing issued statements retain their transfer references and any legacy text instructions.

An optional iPhone Shortcut can forward incoming bank notices. Its scoped key unlocks an encrypted Firebase session that the server verifies for revocation on every request. The user can confirm with Google to enable renewal on demand. Firebase refresh credentials are encrypted with the Shortcut key and stored only on the server. Disconnecting deletes the connection. Revoked Firebase credentials require reconnection. The payment transaction checks the connection again and matches the receiving account on the statement, a unique issued-statement reference, and the full outstanding balance. The server retains the normal transfer record and idempotency hash, without the notice text or bank balance.

The notification entry point is `/api/bank-notifications`. Parsing lives in `src/domain/bank-notification.ts`. Shortcut authorization lives in `src/lib/server/bank-shortcut.ts`, and the payment record is committed by `src/lib/server/payments-repository.ts`. The parser accepts account-first notices and Techcombank notices that start with `+ VND`. It reads the credited amount separately from the balance and accepts the supported compact reference when separators have been removed. Notices without a unique reference return `missing_reference` when the account matches and leave the ledger unchanged.

## Workspace read cache

Authenticated workspace reads use a bounded, 45-second cache in Node process memory. Keys include the Firebase project and database, UID, reader, filters, cursor, Vietnam business date, and the relevant data revisions. Class lists also key by minute for next-slot ordering. A cold instance or expired entry reads Firestore and fills the cache. Concurrent requests for the same key in an instance share one origin read.

After checking Firebase session revocation, the API reads the maintenance lock, account deletion control, and workspace revisions in one Firestore batch. Business transactions write revisions in `users/{uid}/preferences/workspace-cache` along with affected records. A committed revision changes the logical cache key immediately, even on a different instance. An older in-flight read can only fill its old key. Old entries expire from memory or are evicted by the size limit. An idempotent replay or failed transaction does not advance a revision.

The read and write dependency maps are in `src/lib/server/workspace-cache.ts`. The shared `operation` transaction handles normal mutations including cash and Shortcut payments. Profile creation and guest theme changes, shared link creation, and scheduled lesson creation write revisions in their own transactions. Keep revision writes in the same transaction when adding a business mutation. Direct Admin edits outside the application can remain stale until the short TTL expires.

Session verification, sharing authorization, bank Shortcut credentials, exports, and mutations use their existing direct reads. The demo is independent. Private HTTP responses still use `no-store` for browsers and CDNs. No additional caching service or client storage is required.

## Verification boundaries

Keep Firestore Rules tests separate from backend isolation tests because Admin SDK bypasses Rules. The Emulator suite covers both and runs browser tests against a demo build. Hosted public smoke checks verify public routes and anonymous access controls. Cloud indexes, IAM, real Google OAuth, authenticated cloud flows and installation on real devices need separate validation. Prepaid packages and multi-staff permissions are outside the current scope.
