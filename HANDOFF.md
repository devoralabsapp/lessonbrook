# LessonBrook agent handoff

Start with [AGENTS.md](AGENTS.md) for repository rules, [README.md](README.md) for local setup, and [Architecture](docs/ARCHITECTURE.md) for data flows and invariants. Use this file as a dated checkpoint. Check `git status --short --branch` and `git log -8 --oneline` to see what changed since then.

## Checkpoint: 14 November 2026

Application baseline: `e0d8ec2` (`Cache workspace reads with transactional revision invalidation`). This supersedes the visual checkpoint at `2abc60f` and includes the Techcombank notification fixes through `80bcce4`. The authorized release workflow is `main` in [`devoralabsapp/lessonbrook`](https://github.com/devoralabsapp/lessonbrook) to the existing Vercel project. Verify the production alias against the exact pushed commit when handing off a release. Use the current task and branch to decide what to work on next.

- **Workspace cache**. Authenticated directory, lesson, statement, payment, summary and preference reads use a bounded 45-second server memory cache. Every request still checks session revocation and current account controls. A Firestore revision document supplies dependency-specific keys; business writes advance the affected revisions in the same transaction. The next read refills from Firestore, including after Shortcut payments, shared-link creation and scheduled lesson materialization. See `src/lib/server/workspace-cache.ts` and the architecture guide before adding another mutation. Cache storage is per warm server instance; direct Admin edits outside this contract may take up to the TTL to appear. No service, dependency or environment variable was added.

- **Students and Classes**. Notes open by default. Names are larger and bold in both Notes and List. The name frame has a 2px border in the theme's primary color. In Notes, the name frame keeps the stronger paper color and the paper outside it is muted. The red pin, motion preferences, and underlined Edit/Archive actions remain part of the Notes design.
- **Lessons**. `/app/sessions` is the Lessons tab. Opening it from the navigation filters to this month in Vietnam time. Clear filters opens the full history, and student ledgers and explicit dashboard billing links start without a date restriction. Notes fill each complete grid row, keep the content centered, and render `No charge` as a status badge. The list supports automatic filtering, bulk completion of planned lessons and a month calendar.
- **Statements**. Opens on this month for the main tab and on all dates for direct student or status links. The date filter uses issue date, falling back to the Vietnam date of creation. `All time` restores the full history. Payment status sits beneath the amount in Notes. Cash payments and matched transfers appear in editable payment history.
- **Demo and mobile**. `/demo` reuses the workspace with fictional, tab-local data. Use it for visual reproduction. Native iOS/Android shells share the server API and load the web workspace for most ledger screens. A web deploy updates those screens. Changes to the native shell require building and testing the respective app.

For the last visual change, start with `RecordIdentity` in [record-note.tsx](src/components/record-note.tsx) and the `.record-identity` and `.record-note:has(> .record-identity)` rules in [globals.css](src/app/globals.css). The second selector confines the lighter paper treatment to student and class notes. The dark Afterhours FM theme has its own tint strengths.

## Resume work

1. Start from the current worktree. Keep unrelated changes and check for instructions in the directories you edit. Match Node 24, Java 21 for the emulators, and the pinned dependencies in the lockfile. Use `npm ci` when dependencies need installing.
2. For a layout or filter change, reproduce it with `/demo/students`, `/demo/classes`, `/demo/sessions`, or `/demo/statements`. Check the actual list mode and theme named in the request. For shared styles, check Notes and List, narrow and wide screens, English and Vietnamese, and a dark theme. Use the Auth/Firestore Emulator for account-owned flows.
3. Use a clean checkout with demo configuration for local testing if the working copy contains hosted settings. See [local setup](README.md#quick-start). Preserve the loopback origin `http://localhost:3000` and stop only processes you started. Install the browser once with `npx playwright install chromium` if it is missing.
4. Run `npm run check` for lint, types, unit tests and the build, then `npm run test:emulator` for backend, Rules and browser checks. The test runner starts its own app and emulators. If a port is occupied, identify its owner before resolving the conflict. Keep browser traces, emulator data, local configuration and credentials out of commits.
5. In the maintainer workflow, authorized pushes to `main` trigger the linked Vercel production build. For forks or external contributions, follow [CONTRIBUTING.md](CONTRIBUTING.md). Verify the deployment for the intended commit and its production domain before reporting it live. Run `npm run check:public -- https://your-app.example` with the configured origin for read-only smoke checks. Follow [Deployment](docs/DEPLOYMENT.md) for hosting or environment changes.

For existing regression examples, start with [Notes](tests/e2e/notes.spec.ts), [calendars](tests/e2e/calendar.spec.ts), [locale and demo](tests/e2e/i18n.spec.ts), [mobile layouts](tests/e2e/mobile-layout.spec.ts), and [payments and sharing](tests/e2e/payments-sharing.spec.ts).

## Verification at the checkpoint

- Lint, typecheck, Webpack build, 102 unit tests, 73 backend/Rules tests and 26 browser tests passed. Emulator checks ran in an isolated checkout without hosted configuration.
- Cache checks cover hit reuse, expiry, retry after read failure, account isolation, session revocation, idempotent writes, independent query keys and a late old fill racing with a committed update. Shortcut checks warm the payment history, summary, statement and Paid/Unpaid lesson filters before recording the transfer, then verify fresh results.
- Browser checks cover demo, themes/locales, phone layouts, teacher flows, statements and payments. Run `check:public` against the production alias after its exact commit is ready; local results alone do not verify the hosted release.
- This checkpoint did not revalidate real Google OAuth, production writes, IAM/index changes or physical device installation. Use a separate authorized environment and fictional records for those checks.

Update this file when responsibility changes or a meaningful checkpoint is reached. Record the application commit, relevant open work and what was actually verified. Keep permanent rules in `AGENTS.md` and design decisions in `docs/ARCHITECTURE.md`.
