# Public release verification

**English** | [Tiếng Việt](VERIFICATION.vi.md)

Verified on **24 October 2026** using macOS x64, Node 24.22.1, npm 11.19.1, Java 21.0.11, and Playwright Chromium 1.64.1. Dependency versions were preserved in the lockfile.

| Check | Result |
|---|---|
| npm ci | Passed on the independent source export |
| npm run lint | Passed |
| npm run typecheck | Passed |
| npm test | 60/60 passed |
| npm run build | Passed with Webpack, without cloud credentials/configuration |
| npm run test:emulator | 53 backend/Rules + 12 E2E passed; **125/125** total |
| npm audit --omit=dev | 0 advisories at the time of verification |
| WIF template | Shell syntax and print-config passed; missing target confirmation stops before cloud operations |
| Gitleaks 8.30.1 | No secrets detected in staged content or the new public Git history |

Tests use demo projects and loopback only, without cloud business writes. The runner cleaned up its server/emulators afterward. Some Google SDK workers emitted metadata lookup warnings without failing tests. Emulator results do not prove real Google OAuth, HTTPS cookies, IAM, cloud indexes, or installation on real devices; verify these separately when self-hosting.

The initial public source commit also [passed GitHub CI](https://github.com/devoralabsapp/lessonbrook/actions/runs/40001554602). The documentation-only follow-ups did not alter application code; the later branding update was revalidated separately below.

## Sanitization scope

The public edition starts with fresh Git history and a neutral author identity, excluding private history. It contains no actual environment files, credential stores, Emulator data, operational screenshots, internal reports, or personal machine paths. Deployment-specific Firebase/Vercel identifiers and domains were replaced with placeholders; smoke checks default to localhost. PNG icons contain no EXIF or text metadata.

Gitleaks and identifier reviews reduce exposure risk but cannot guarantee the absence of every kind of sensitive information. Do not add real data or secrets to issues, pull requests, or commits when developing further.

## LessonBrook rename — 24 October 2026

Revalidated the renamed application on macOS using the same pinned runtime/dependency versions: lint, typecheck, unit tests (60), Webpack build, backend/Rules tests (53) and browser E2E (12) all passed: **125 total**. The new title/wordmark and 360px layout were also checked. Gitleaks 8.30.1 found no secrets in the branding diff or public Git history, and the deployment-identifier/personal-path review found no matches. This evidence covers the public source edition, independently of any hosted deployment.

## Dark themes — 25 October 2026

The Command Line and Visual Code update passed lint, typecheck, Webpack build and all **125 local tests** (60 unit, 53 backend/Rules, 12 E2E). The theme checks now exercise seven saved preferences, account isolation, 360px layouts and at least 4.5:1 contrast for body, muted, form-value and primary-action text in both dark themes. Statement previews remain explicitly light. Desktop/mobile dashboards and student forms were inspected with fictional Emulator data. The branding and business/data identifiers remain compatible; no cloud writes are part of these checks. Gitleaks 8.30.1 found no secrets in the change.
