# Self-hosting on your own infrastructure

**English** | [Tiếng Việt](DEPLOYMENT.vi.md)

Local development and CI use `demo-chotcong` on loopback without cloud credentials. Supply your own Firebase, Vercel, and IAM resources for a hosted deployment. Keep `.env.local` dedicated to emulators; do not pull production variables into it.

## Preparation

1. Create a separate Firebase project, enable the Google provider, and register a Web App. Choose the Firestore location before creating the database. Review quotas and costs for services you enable.
2. Create a Vercel project from your fork/repository, using Node 24, `npm ci`, and `npm run build`. Use a stable HTTPS hostname. Set APP_ORIGIN to that exact origin and add its hostname to Firebase Auth authorized domains.
3. Review and deploy `firebase/firestore.rules` and `firebase/firestore.indexes.json` to the correct project. Rules deny all clients; Admin APIs still need UID isolation. Wait for composite indexes to be READY. For a shared project, review existing Rules/indexes and preserve unrelated configuration.
4. Set up backend access using WIF below, complete the environment configuration, and rebuild to embed NEXT_PUBLIC settings. Keep sign-in unavailable when configuration is incomplete.

## Hosting environment variables

Use your Firebase Web App's configuration:

- `APP_ORIGIN`: your deployment's HTTPS origin.
- `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: the same real project you own.
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, and any additional Web App identifiers.
- `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=false`; omit `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST`.
- `FIREBASE_ADMIN_AUTH_MODE=vercel-oidc`.
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: the full resource name of your WIF provider.
- `GCP_SERVICE_ACCOUNT_EMAIL`: a service account in that Firebase project.
- `NODE_OPTIONS=--experimental-require-module` for Vercel's runtime with Firebase Admin ESM.

Never put credentials in NEXT_PUBLIC variables, copy old OIDC tokens, hardcode access tokens, or commit service-account keys. On Node hosts outside Vercel, the adapter supports ADC through GOOGLE_APPLICATION_CREDENTIALS; keep credentials outside the checkout and use your host's secret management. Emulators are local/CI only.

## Optional statement email through Gmail

The **Send email** button uses the recipient saved in the student profile and the active statement link. It is available to verified LessonBrook sign-ins in the sender whitelist on a hosted deployment. Demo and Emulator never send mail.

Set `STATEMENT_EMAIL_FROM` to the Gmail sender address and `STATEMENT_EMAIL_TEACHER_WHITELIST` to the Google sign-in email addresses allowed to send. Separate addresses with commas or newlines. Addresses are matched exactly and ignore letter case. Each allowed teacher sends statements from their own ledger to their saved student contacts. An empty whitelist disables sending. Deployments with the legacy `STATEMENT_EMAIL_TEACHER` setting keep using that single address until a whitelist is set. Set these values on the server in the production environment and redeploy.

- For Gmail SMTP, set `STATEMENT_EMAIL_GMAIL_APP_PASSWORD` as a secret. Use a [Google App Password](https://support.google.com/accounts/answer/185833) from the sender account. LessonBrook uses TLS on port 465. Gmail may reject sign-in from a hosted server.
- For Gmail API OAuth, leave the app password unset and enable the Gmail API. Authorize the sender mailbox using an OAuth client you control with the [`gmail.send` scope](https://developers.google.com/workspace/gmail/api/auth/scopes) and offline access. Set `STATEMENT_EMAIL_GOOGLE_CLIENT_ID`, `STATEMENT_EMAIL_GOOGLE_CLIENT_SECRET`, and `STATEMENT_EMAIL_GOOGLE_REFRESH_TOKEN`. Store the client secret and refresh token as secrets. A Google OAuth app left in external Testing has a [seven-day refresh token lifetime](https://developers.google.com/identity/protocols/oauth2#expiration) for this scope.

Open an issued statement, choose **Share**, verify the sender and recipient, then choose **Send email**. The email includes the statement number and read-only link. If a send cannot be confirmed, check Gmail's Sent folder before creating a new link. Sending an email does not extend the link expiration.

## Vercel OIDC / Workload Identity Federation

The application currently permits OIDC only in the technical **Production** environment of the trusted Vercel project. Previews do not use its production identity. For staging, use separate Firebase and Vercel projects; do not broaden production trust to all previews.

`scripts/gcp/setup-vercel-wif.sh` is an administrative template. After reviewing IAM changes, provide **your own identifiers**:

```bash
export CC_PROJECT_ID=your-firebase-project
export CC_PROJECT_NUMBER=YOUR_NUMERIC_PROJECT_NUMBER
export CC_VERCEL_TEAM_SLUG=your-team
export CC_VERCEL_TEAM_ID=YOUR_TEAM_ID
export CC_VERCEL_PROJECT_NAME=your-vercel-project
export CC_VERCEL_PROJECT_ID=YOUR_VERCEL_PROJECT_ID
bash scripts/gcp/setup-vercel-wif.sh --print-config
```

Replace every placeholder with exact values returned by Google/Vercel. `--print-config` prints non-secret identifiers only. Missing or malformed values are rejected. To create APIs/pool/provider/service account and grant data/Auth permissions, authenticate gcloud with appropriate administrative permissions, set `CC_CONFIRM_PROJECT` to the exact CC_PROJECT_ID, and run the script without arguments. This performs real IAM changes: read the script and verify the project number and permissions first. It stops if an existing provider differs from the expected configuration and creates no private key.

Trust restricts issuer/audience, immutable team/project IDs, the production environment, and the exact subject. Do not grant Owner/Editor to the runtime. Datastore User/Firebase Auth Admin permissions remain broad within a project; use separate projects for data isolation.

## Configuration deployment and preflight

Normally, review the configuration and deploy it through Firebase Console/CLI with an explicit project. `scripts/gcp/apply-firestore-config.ts` is retained as a safe-apply reference: **its target is the placeholder `your-firebase-project`, with project number `000000000000`**. Before using it against cloud resources, replace both the target and project-number allowlist with your identifiers and update the corresponding unit fixtures. Never use the placeholder as a real target.

The helper runs only when FIREBASE_APPLY_CONFIG matches its fixed target, Vercel Production/OIDC configuration is complete, and emulators are disabled. It rejects unfamiliar Rules, adds missing indexes, preserves unrelated configuration, and waits for READY. If you use this path, grant limited Rules/index permissions for the target while applying changes, then remove those permissions and FIREBASE_APPLY_CONFIG. Normal builds are read-only.

Prebuild checks token exchange, Auth reads, Firestore, and query/index shapes under a random nonexistent UID namespace, without creating users or tuition data. A successful build does not replace real Google OAuth, write permissions, or two-account/revocation checks.

## Post-deployment checks

```bash
npm run check:public -- https://your-app.example
```

Supply your origin; the default targets localhost. Public smoke checks are read-only: public pages, five protected pages/ten anonymous API requests, HTTPS cookies/cache/referrer controls, manifest, and icons. They do not authenticate or write business data.

On staging with fake data, check Google login A/B, HTTP UID isolation, client Rules denial, revoking A without affecting B, prices/statements/payments, share link rotation/revocation, export, deletion, and recovery. Test real devices and define support arrangements before inviting users. Establish your own backup/retention/recovery strategy; this source includes only an Emulator backup rehearsal tool, not automatic cloud backups.
