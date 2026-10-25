# Changelog

## Unreleased

- Add Playful Retro Neo-Brutalism as an eighth optional theme: warm cream, pastel summary panels, black outlines/offset shadows, pill buttons and bundled Nunito under SIL OFL 1.1. Reuse instant preview/explicit save; scope retro component styles to preserve all other themes and light shared statements. Respect reduced motion.

- Preview themes instantly in settings; persist only after Save, with cancel and automatic reset on navigation/reload. Failed saves keep the preview for retry. Make Command Line panels neutral black.

- Add Command Line and Visual Code dark themes, semantic action/status/form colours, and explicit light statement previews. Preferences use the existing account-scoped save flow; the default remains Natura.

- Rebrand the application as LessonBrook and rename the repository to `devoralabsapp/lessonbrook`. Update clone instructions, badges and community/security links. Existing data identifiers and local guards remain compatible.

## 0.1.0 — 2026-10-24

Initial MIT-licensed public source release.

- Individual, group, and class lessons; saved rates; per-student statements; partial payment and correction workflows.
- Expiring/revocable statement sharing, export/account deletion, search/filters, and five themes.
- Credential-free local development using Firebase Auth/Firestore Emulator, with guarded sample data and backup rehearsal tools.
- English-first documentation with Vietnamese translations, contribution/security guidance, maintainer process, and roadmap.
- A verified baseline of 125 local tests and a successful GitHub CI run on the initial source commit. Application code has not changed in the documentation follow-ups.
- Cloud configuration uses templates/placeholders. No production data, private Git history, personal machine paths, or existing deployment identifiers are included.

### Limitations

The application UI is Vietnamese and uses integer VND/Vietnam business dates. Cloud OAuth, IAM/indexes, authenticated recovery, real-device installation, production backup, and external adoption need separate validation. This release does not certify any hosted instance for production use.
