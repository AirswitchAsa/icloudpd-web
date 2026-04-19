# icloudpd-web Frontend Redesign (Sub-project 2)

**Date:** 2026-04-19
**Status:** Approved for planning
**Context:** Sub-project 2 of the icloudpd-web rewrite. Sub-project 1 (backend, REST+SSE) is merged. This rewrites the frontend as a Vite SPA to consume the new API. Sub-project 3 (packaging/ops) follows.

## Goal

Replace the existing Next.js frontend with a minimal Vite+React SPA that consumes the new REST+SSE backend, served by FastAPI from the same process so `pipx install icloudpd-web` ships a working UI.

## Scope

**In scope:**
- New `web/` directory (old Next.js `web/` deleted — recoverable from git history)
- Login, policies list, edit policy, run detail (live SSE), run history, settings, MFA flow
- Passwordless mode when server has no password configured
- Backend serves built static assets from `src/icloudpd_web/web_dist/`
- Small backend tweaks: `Authenticator` accepts `password_hash=None`; static mount + SPA catch-all

**Out of scope:**
- Multi-user, role-based access
- Deep-linkable routes (modal-driven navigation mirroring old UX)
- E2E browser tests
- Docker / CI packaging (sub-project 3)

## Architecture

**Stack:** React 18 + Vite + TypeScript + TanStack Query + Tailwind + shadcn/ui.

**Layers:**
- `src/api/` — typed REST client (fetch wrapper with `credentials: 'include'`, error normalization) and SSE helpers
- `src/hooks/` — TanStack Query hooks for each resource; SSE subscription hooks that invalidate query caches on relevant events
- `src/components/` — UI, mirroring old component shapes (PolicyList, EditPolicyModal, MFAModal, etc.)
- `src/app.tsx` — top-level auth gate + modal orchestration. No router — modal-driven like the old app.

**SSE wiring:**
- `/policies/stream`: on `generation` event, invalidate `['policies']` query → refetch.
- `/runs/{id}/events`: per-run subscription. Log lines appended to a local run-store (zustand or Query cache write); progress and status update the same store. Status `awaiting_mfa` flips the run-detail modal into MFA input mode. Status terminal → close EventSource.

**Auth:**
- Cookie session (backend sets on `POST /auth/login`). All fetches use `credentials: 'include'`.
- `GET /auth/status` returns `{auth_required: bool, authenticated: bool}`.
- If `auth_required=false`, skip login screen entirely — passwordless mode.
- Any 401 from other endpoints → bounce to login.

**Backend tweaks required:**
- `Authenticator(password_hash=None)` supported; `require_auth` becomes no-op when no hash set.
- `/auth/login` returns 400 in passwordless mode.
- `/auth/status` reports `auth_required`.
- `create_app` mounts `StaticFiles` at `/assets/`; catch-all route returns `index.html` for SPA paths (any non-API GET that doesn't match a route).
- `pyproject.toml` includes `src/icloudpd_web/web_dist/**` in package data.

## Screens

Same UX shape as the old app. Modal-heavy, single-page.

1. **Login** — one password field. Hidden when `auth_required=false`.
2. **Policies panel** — table with name, username, status, next run, last run. Row actions: Run, Stop, Edit, Delete, History.
3. **Edit Policy modal** — full form for policy fields, `[icloudpd]` block, notifications, AWS config. "Set password" button opens a sub-form calling `PUT /policies/{name}/password`.
4. **Run Detail modal** — live log (tail, auto-scroll, pause-on-scroll-up), progress bar, status badge. On `awaiting_mfa` status, shows 6-digit input.
5. **Run History modal** — last 10 runs for a policy with links to log viewer.
6. **Log Viewer modal** — plain text viewer for `GET /runs/{id}/log`.
7. **Settings modal** — Apprise URLs (list), log retention count.
8. **MFA modal** — triggered by status; `PUT /policies/{name}/mfa` with code.
9. **Confirmation dialogs** — Delete policy, Cancel run.

## Error handling

Global toast component listens for API errors normalized as `{error, error_id, field}`. `field` highlights the matching form input when present. `error_id` (e.g., `run-abc123`) rendered in the toast for support.

## File structure

```
web/
  package.json, vite.config.ts, tsconfig.json, tailwind.config.ts
  index.html
  src/
    main.tsx
    app.tsx
    api/
      client.ts      # fetch wrapper + error normalization
      auth.ts
      policies.ts
      runs.ts
      settings.ts
      mfa.ts
      sse.ts         # EventSource + Last-Event-ID helpers
    hooks/
      useAuth.ts
      usePolicies.ts
      usePolicy.ts
      useRuns.ts
      useRunEvents.ts
      useSettings.ts
    components/
      AuthGate.tsx
      LoginScreen.tsx
      PolicyList.tsx
      PolicyRow.tsx
      EditPolicyModal.tsx
      RunDetailModal.tsx
      RunHistoryModal.tsx
      LogViewerModal.tsx
      MfaModal.tsx
      SettingsModal.tsx
      ConfirmDialog.tsx
      Toast.tsx
      ui/            # shadcn-generated primitives
    types/
      api.ts         # response types mirroring backend pydantic
    store/
      runStore.ts    # per-run log/progress/status cache
  tests/             # Vitest + RTL
```

## Dev setup

- `vite.config.ts` proxies `/auth`, `/policies`, `/runs`, `/settings` to `http://localhost:8000`.
- Production build emits to `../src/icloudpd_web/web_dist/`.
- `Makefile` target `build-web` runs `cd web && npm ci && npm run build`.

## Testing

- **Vitest** for unit + integration.
- **MSW** mocks HTTP for hook and component tests.
- **Fake EventSource** for SSE tests.
- Key flows covered: login → create policy → run → live log → MFA → complete; error toasts; passwordless mode skips login.
- No Playwright/Cypress in v1 — manual smoke test acceptable for the handful of screens.

## Quality gates

- `tsc --noEmit`
- `vitest run`
- `eslint`
- `prettier --check`

Run alongside existing Python gates in CI (added in sub-project 3).

## Migration

The old `web/` directory is deleted in the first task; recoverable via git. README note indicating the new UI is the default going forward.
