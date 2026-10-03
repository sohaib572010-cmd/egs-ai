# EGS AI — Coding Guidelines (Mandatory)

> These rules apply to ALL code in this repository (web + mobile + SQL). They are requirements, not suggestions. Read `PRD.md` (same folder) first for full project context. Any AI agent or developer working here must follow every rule below on every change.

## 1. No emojis in the design

Do not use emojis anywhere in the UI (labels, buttons, headers, empty states, notifications, dialogs). Use icons instead:
- Web: `lucide-react` icons (the project already migrated from raw emojis to Lucide — commit 9b590f7; do not regress).
- Mobile: Material icons / `flutter_svg`.
- Exception: emoji strings inside the AI/SSE `search_step` protocol are data, not design — the web client already maps them to Lucide icons; keep doing that.

## 2. Web design must work on every screen size

All web pages/views must be fully usable on mobile phones, tablets, and desktops — every screen size — with **no missing, cut-off, or overlapping elements**.
- Use the existing breakpoints in `web/src/app/globals.css` (768px / 480px / 360px, `hover:none`, `prefers-reduced-motion`) and the `isMobile` (<768px) JS flag.
- Any new multi-column grid MUST collapse to one column on small screens (known offender to fix when touched: admin dashboard fixed grids).
- Never rely on hover as the only way to reach an action (touch devices can't hover).
- Respect safe-area insets and RTL layout in everything you add.
- Test (or reason through) 360px, 768px, and 1280px widths before considering a UI change done.

## 3. Mobile app must be fully responsive — no overflow errors

The Flutter UI must render without ANY design errors on all device sizes, and element dimensions must be appropriate:
- The **yellow-and-black striped overflow bar** (Flutter's RenderFlex overflow warning, as seen in the Filters/selection area) must NEVER appear. Treat any overflow as a bug to fix immediately.
- Wrap flexible `Row`/`Column` children in `Expanded`/`Flexible`; use `TextOverflow.ellipsis`/`Wrap` for long Arabic text; avoid fixed pixel widths (e.g., the `width: 280` audio player) — use constraints relative to `MediaQuery`/`LayoutBuilder` instead.
- Wide content (tables, math, code) must scroll horizontally inside its bubble, never stretch the layout.
- Verify layouts at narrow widths (~320dp) and with long text before considering a change done.

## 4. Concise code, sparse comments, no emojis in code

- Keep code concise and readable. No dead code, no commented-out blocks, no debug leftovers (`console.log`, `debugPrint`, per-chunk `/api/log` telemetry).
- Comments only when genuinely needed to clarify non-obvious logic — never decorative, never narrating what the code plainly says.
- No emojis in code, comments, commit messages, or log output.

## 5. Clean, robust, modern code

- Use the latest stable APIs of the project's stack (Next.js 16 App Router, React 19, TypeScript strict, Flutter/Dart 3, Material 3). For Next.js specifics, read `web/AGENTS.md` and `node_modules/next/dist/docs/` first — this Next version has breaking changes.
- Match the existing patterns of each codebase (single-file clients, CSS custom properties on web, `EgsTheme` + `setState` on mobile) unless a change is explicitly about restructuring.
- Handle errors and edge cases (empty states, network failures, stream interruptions) — no silent failures.
- Keep the two clients consistent: shared concepts (colors, grade names, protocol tags, API contracts) must not drift apart.

## 6. Security is non-negotiable

Code must always be free of critical vulnerabilities and secure against attacks:
- Never put secrets, API keys, service-role keys, passwords, or their hashes in client code, comments, or commits. (See PRD section 21 for existing violations that must not be repeated and should be fixed when touched.)
- Never trust client input: validate/whitelist on the server, cap payload sizes, never interpolate user input into query filters or SQL.
- All billing/credit mutations and credential writes happen server-side only — never from a client.
- Sanitize all AI-generated or user-generated content before rendering (DOMPurify on web, the XML SVG sanitizer on mobile; KaTeX stays `trust:false`).
- No authentication backdoors (test OTPs, hardcoded credentials) may survive into production code.
- New endpoints require authentication and, where they cost money or resources, metering.

## 7. Linked-feature completeness (do the whole change)

When adding, changing, or removing a feature that is linked to another page, screen, API route, or layer — and the change requires modifying that other place for the feature to appear and function correctly — **you must update that other place too**, even if it was not explicitly requested or noticed, unless explicitly told not to.

Concretely for this project (full map in PRD section 22):
- Change a chat protocol tag → update backend prompts (`tutor_prompts.ts`) AND web parser (`page.tsx`) AND mobile parser (`main.dart`).
- Change an API route → update web fetch calls AND mobile HTTP calls.
- Change the DB schema → write a migration AND update `db.ts` AND mobile direct queries AND the local `db_data.json` shape.
- Change a color/token → update web `globals.css` AND mobile `EgsTheme` so the platforms stay consistent.
- Change grades/subjects/plans enums → update both clients' name maps AND server validation whitelists.
- Anything shown in the admin panel (curricula, versions, notifications, config) has a consumer on the student side and/or mobile app — keep both ends working.

A feature is only "done" when it works end-to-end on every platform that surfaces it.

## 8. Keep PRD.md continuously updated

Upon completion of EVERY task, update `PRD.md` to reflect what was added, changed, or removed — this is part of the task itself, not optional follow-up work:
- New/changed/deleted feature, API route, DB table or column, protocol tag, env var, screen, or setting → update the corresponding PRD section(s) in the same working session.
- Fixed something listed in PRD section 20 (Known Issues) or section 21 (Security) → remove or amend that entry.
- Introduced a new limitation, dependency, or known issue → add it to the relevant section.
- Update the "Last updated" date at the top of PRD.md.

The PRD is the single source of truth that lets any AI agent understand the project without reading the code. A task that changes the project but leaves PRD.md stale is an incomplete task.
