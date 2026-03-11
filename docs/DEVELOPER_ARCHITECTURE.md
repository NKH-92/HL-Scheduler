# Scheduler Developer Architecture

## Purpose

This document is the shortest possible map for engineers and Codex sessions working in this repository.
Read this before making structural changes.

## App Surfaces

- `src/App.jsx`
  Legacy schedule editor shell.
  Composes focused hooks and modal wiring; avoid re-growing orchestration here.
- `src/components/PublicSchedules.jsx`
  Public schedule browsing surface.
  Owns folder navigation, kanban/list browsing, preview, and admin actions for public schedules.
- `src/collab/App.jsx`
  Collaboration workspace shell.
  Routes between collab home, workspace, and share views.
- `src/collab/WorkspaceView.jsx`
  Server-backed workspace screen with snapshot loading and realtime updates.

## Routing

- `src/main.jsx`
  Chooses between legacy and collab shells from pathname.
- `src/collab/router.js`
  Manual path parsing and navigation helpers for `/collab/*` and `/share/*`.

## State Boundaries

- `src/hooks/useSchedulerStorage.js`
  Local editor persistence for the legacy surface.
- `src/context/AuthContext.jsx`
  Shared auth session, permissions, and sign-in/sign-out flow.
- `src/hooks/useAsyncDialog.js`
  Promise-based confirm/alert dialog state used by the legacy editor.
- `src/hooks/useEditorActions.js`
  Legacy editor task/vacation mutation controller.
- `src/hooks/useProjectImport.js`
  Legacy import parsing, confirmation, and imported project normalization.
- `src/hooks/useProjectExports.js`
  Legacy image/report/xlsx/json export controller and modal state.
- `src/hooks/usePublicScheduleWorkflow.js`
  Public schedule import, shared bootstrap, folder loading, and publish/update workflow.

## API Boundaries

- `src/utils/publicSchedulesApi.js`
  Public/admin/auth API for schedules and folders.
- `src/collab/api.js`
  Collab API client for workspaces, cards, tasks, time-off, shares, and realtime URL building.
- `src/utils/apiClient.js`
  Shared low-level JSON transport, timeout handling, and error extraction.

## Worker Boundaries

- `server/public-schedules-worker/src/worker.mjs`
  Public schedule CRUD, runtime schema bootstrap, and top-level HTTP handling.
- `server/public-schedules-worker/src/worker-router.mjs`
  Route dispatch table for worker HTTP paths.
- `server/public-schedules-worker/src/auth-admin.mjs`
  Auth, session, approval, and admin-user domain handlers.
- `server/public-schedules-worker/src/folders.mjs`
  Folder admin/list/order/delete domain handlers.
- `server/public-schedules-worker/src/folder-service.mjs`
  Folder tree/path/order helpers shared by worker domains.
- `server/public-schedules-worker/src/collab-api.mjs`
  Collab snapshot, CRUD, import, and realtime implementation.
- `server/public-schedules-worker/src/collab-router.mjs`
  Route dispatch table for `/api/v2/*` collab paths.

## Refactoring Rules

- Prefer adding or extending focused hooks/components before growing `App.jsx` or `PublicSchedules.jsx`.
- In the legacy editor, prefer extending `useEditorActions`, `useProjectImport`, `useProjectExports`, or `usePublicScheduleWorkflow` before adding new stateful logic to `App.jsx`.
- Prefer changing `src/utils/apiClient.js` or a single API module instead of duplicating fetch logic.
- Keep route dispatch in router modules and business logic in handler modules.
- In the worker, keep schedule CRUD in `worker.mjs` and push auth/admin/folder logic into domain modules.
- When touching both legacy and collab schedule models, check whether the same domain field exists in:
  `useSchedulerStorage`, `publicSchedulesApi`, `collab/api`, worker responses, and collab snapshots.

## Minimum Verification

Run these before closing a Codex task:

```bash
npm run lint
npm run check:syntax
npm run test
npm run build
```

## Good First Split Targets

- Additional subcomponents under `src/components/public-schedules/`
- Additional hooks under `src/hooks/`
- Worker handler extraction by domain:
  schedules, collab snapshot, collab realtime
