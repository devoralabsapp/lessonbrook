# Architecture and business rules

**English** | [Tiếng Việt](ARCHITECTURE.vi.md)

Next.js App Router, React, TypeScript, Tailwind 4, Firebase Authentication, and Cloud Firestore. Node 24; dependencies are pinned exactly in the lockfile. Keep bundler and dependency changes separate from unrelated business fixes.

| Directory | Contents |
|---|---|
| `src/app` | Pages and Node APIs |
| `src/domain` | Schemas, money, dates, statements, and export data |
| `src/lib/firebase` | Client Auth, server Admin, and OIDC/WIF |
| `src/lib/server` | Repositories, sessions, HTTP handling, and transactions |
| `src/features` | Student, class, lesson, statement, payment, and sharing UI |
| `firebase` | Rules, indexes, and independent Rules tests |
| `tests/integration` | HTTP/backend isolation with two UIDs, transactions, and data workflows |
| `tests/e2e` | Chromium, real Auth Emulator popups, retries, and reloads |

## Product name and compatibility

LessonBrook is the product and repository name. Existing `chotcong` data paths, cookie names, demo project IDs and loopback guards remain internal compatibility identifiers. Renaming the product does not migrate or erase stored data; do not change these identifiers solely to rebrand a fork.

## Data boundaries

All business operations go through server APIs. Derive the UID from a revocation-checked Firebase session; never accept browser-supplied owner IDs or document paths. Private data lives under `apps/chotcong/users/{uid}`. Admin SDK bypasses Rules, so backend isolation tests and client Rules tests provide separate evidence.

Session cookies are HttpOnly/Lax, Secure on HTTPS, and last up to five days. Browser Auth uses memory persistence: exchange a recent-auth ID token for a server cookie, then sign out the client. Mutations check Origin/CSRF, strict payloads/body limits, and UUID idempotency keys. Do not cache session verification between requests or store tokens/tuition data in browser storage or logs.

## Invariants

- Money uses safe integer VND; business dates use YYYY-MM-DD in Vietnam. System Timestamps are generated on the server and documents carry schemaVersion.
- Changing a student's or class's default rate does not alter saved lessons. Classes support up to 50 students, charging only selected participants; each student has separate tuition rows and statements.
- Transactions read before writing. Create result IDs outside callbacks, which may retry. The same payload and request ID return the same result; a different payload with that ID is rejected.
- Statements contain at most 100 eligible lessons. Issuing a statement commits snapshots/counters and billedStatementId locks in one transaction. Drafts do not create receivables; voiding requires no valid payment records.
- Payments cannot exceed the outstanding balance. Voiding preserves history; reconcile paidVnd/count with payment records.
- Share links use random tokens in the `/s#token` fragment. The browser sends a POST body; the server stores only a hash. Sharing includes preview, expiry, rotation, revocation, and a public response allowlist. Never log tokens, cookies, or headers.
- Export pages share a server readTime; ZIP/CSV exports are not Firestore backups. Account deletion is a state machine with leases/checkpoints and write/link locks. Never delete real accounts for testing.

## Appearance preferences

The application shell holds a settings-visit preview separately from the saved account preference. Selecting a theme only changes the local preview. Save commits it through the existing authenticated, idempotent appearance endpoint; a failed save retains the preview for retry. Cancel, route navigation and reload restore the saved preference. Shared statements keep an explicit light palette.

## Limits

There are no automatic bank payments, recurring schedules, prepaid packages, or multi-staff center permissions. The manifest provides a launch shortcut, without a service worker or offline cache. Emulator tests do not prove cloud indexes, IAM, OAuth, or installation on real devices. Cloud checks need isolated staging and fake data.
