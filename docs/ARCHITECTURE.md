# Architecture and business rules

**English** | [Tiếng Việt](ARCHITECTURE.vi.md)

Next.js App Router, React, TypeScript, Tailwind 4, Firebase Authentication, and Cloud Firestore. Node 24; dependencies are pinned exactly in the lockfile. Keep bundler and dependency changes separate from unrelated business fixes.

| Directory           | Contents                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `src/app`           | Pages and Node APIs                                                    |
| `src/domain`        | Schemas, money, dates, statements, and export data                     |
| `src/lib/firebase`  | Client Auth, server Admin, and OIDC/WIF                                |
| `src/lib/server`    | Repositories, sessions, HTTP handling, and transactions                |
| `src/features`      | Student, class, lesson, statement, payment, and sharing UI             |
| `firebase`          | Rules, indexes, and independent Rules tests                            |
| `tests/integration` | HTTP/backend isolation with two UIDs, transactions, and data workflows |
| `tests/e2e`         | Chromium, real Auth Emulator popups, retries, and reloads              |

## Product name and compatibility

LessonBrook is the product and repository name. Existing `chotcong` data paths, cookie names, demo project IDs and loopback guards remain internal compatibility identifiers. Renaming the product does not migrate or erase stored data; do not change these identifiers solely to rebrand a fork.

## Data boundaries

All business operations go through server APIs. Derive the UID from a revocation-checked Firebase session; never accept browser-supplied owner IDs or document paths. Private data lives under `apps/chotcong/users/{uid}`. Admin SDK bypasses Rules, so backend isolation tests and client Rules tests provide separate evidence.

Session cookies are HttpOnly/Lax, Secure on HTTPS, and last up to five days. Browser Auth uses memory persistence: exchange a recent-auth ID token for a server cookie, then sign out the client. Mutations check Origin/CSRF, strict payloads/body limits, and UUID idempotency keys. Do not cache session verification between requests or store tokens/tuition data in browser storage or logs.

## Invariants

- Money uses safe integer VND; business dates use YYYY-MM-DD in Vietnam. System Timestamps are generated on the server and documents carry schemaVersion.
- Changing a student's or class's default rate does not alter saved lessons. Classes support up to 50 students, charging only selected participants; each student has separate tuition rows and statements.
- Transactions read before writing. Create result IDs outside callbacks, which may retry. The same payload and request ID return the same result; a different payload with that ID is rejected.
- Statements contain at most 100 eligible lessons. Issuing a statement commits snapshots, counters and billedStatementId locks in one transaction. Existing drafts do not create receivables. An issued statement without active payments can be amended in place, with changes to the total and lesson locks committed together. Its number and bank snapshot remain fixed. Voiding requires no valid payment records.
- Payments cannot exceed the outstanding balance. Voiding preserves history; reconcile paidVnd/count with payment records.
- Share links use random tokens in the `/s#token` fragment. The browser sends a POST body; the server stores only a hash. Sharing includes preview, expiry, rotation, revocation, and a public response allowlist. Never log tokens, cookies, or headers.
- Export pages share a server readTime; ZIP/CSV exports are not Firestore backups. Account deletion is a state machine with leases/checkpoints and write/link locks. Never delete real accounts for testing.

## Appearance preferences

A home page theme selection is kept in a short-lived cookie and rendered on the sign-in page. After verifying a recent Google ID token, the session endpoint applies the validated selection to that account in the profile transaction and clears the cookie. Sign-ins without a selection keep the stored preference.

The application shell holds a preview from the header picker separately from the saved account preference. Save commits it through the authenticated, idempotent appearance endpoint. Cancel, dismissing the picker, route navigation and reload restore the saved preference. Shared statements keep an explicit light palette.

Retro component styles are scoped to `data-theme="playful-retro"` and exclude the `data-theme="statement"` boundary. Palette, border and shadow tokens live in globals.css; shared cards can opt into `data-tone="yellow|pink|blue|mint"`. Buttons expose their existing variant as data for theme styling. Nunito is bundled under SIL OFL 1.1 via next/font/local, with preloading disabled so unused themes do not preload it.

## Limits

Issuing a statement freezes the configured bank details on that statement. The teacher and the recipient can scan the same VietQR while there is an outstanding balance. The app renders it locally with the outstanding amount and a transfer reference that fits the NAPAS 25-character memo field. Existing issued statements retain their transfer references and any legacy text instructions.

An optional iPhone Shortcut can forward incoming bank notices. Its scoped key unlocks an encrypted Firebase session that the server verifies for revocation on every request. The user can confirm with Google to enable renewal on demand. Firebase refresh credentials are encrypted with the Shortcut key and stored only on the server. Disconnecting deletes the connection. Revoked Firebase credentials require reconnection. The payment transaction checks the connection again and matches the receiving account on the statement, a unique issued-statement reference, and the full outstanding balance. The server retains the normal transfer record and idempotency hash, without the notice text or bank balance.

Weekly class slots use Vietnam time. The upcoming schedule projects them through the next seven days. A saved class lesson at the same time takes precedence. Projected slots open a prefilled lesson form and only saved lessons affect attendance and billing. Prepaid packages and multi-staff permissions are outside the current scope. The manifest provides a launch shortcut. Emulator tests do not prove cloud indexes, IAM, OAuth, or installation on real devices. Cloud checks need isolated staging and fake data.
