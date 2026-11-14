<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## LessonBrook — community edition

Start with [HANDOFF.md](HANDOFF.md) for the latest checkpoint and open work. Read [README.md](README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing behavior. Read the relevant installed Next.js guide in `node_modules/next/dist/docs/` before editing code. Keep the pinned dependencies and Webpack unless an upgrade is explicitly in scope.

All business reads/writes go through Node server APIs. Derive UID from a revocation-checked Firebase session; never accept an owner or document path from the client. Admin bypasses Rules. Keep Rules tests separate from backend isolation tests. Never remove demo/loopback guards from seed, backup or test scripts. Keep login unavailable while server configuration is missing.

Use integer VND, Vietnam business dates, server Timestamps, schemaVersion and transaction idempotency. Read relevant documents before writes; create result IDs outside transaction callbacks. Preserve price snapshots and billedStatementId locks.

Use `/demo` for UI reproduction with fictional data and the Auth/Firestore Emulator for account-owned flows. Screens under `/demo` reuse the workspace. When changing a business behavior available in both modes, check the shared domain logic and the demo command handler as well as the authenticated implementation. For locale or theme changes, verify English and Vietnamese and the affected light/dark palettes. Keep shared statements on their own light palette.

Use Node 24 and Java 21. Required checks are `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:emulator`. `npm run check` runs the first four. Stop only owned local servers before the Emulator command. Use a clean checkout for emulator work when the current one has hosted configuration. Cloud OAuth, HTTPS cookies, indexes, IAM and device installation require separate checks. Keep local data, credentials, logs, environment files and browser traces out of commits and external reports. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for self-hosting.

Follow the maintainer's authorized Git/deployment workflow or [CONTRIBUTING.md](CONTRIBUTING.md) for external contributions. Check the staged diff before pushing. Report the exact commit and verification status when handing off a deployment. Update [HANDOFF.md](HANDOFF.md) at a meaningful checkpoint and keep durable design details in the architecture guide.
