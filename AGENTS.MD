# Agent Guide

This repo is a TypeScript workspace for a Salesforce Apex debug log profiler. It
has a framework-free parser package plus a React web app and an Electron desktop
wrapper that share the same web UI.

## Workspace Map

- `packages/core`: parser/profiler logic. Keep this framework-free so it can run
  in the browser, tests, and desktop shell.
- `apps/web`: Vite + React UI. Apex log files are parsed locally in the browser.
- `apps/desktop`: Electron wrapper for the web app.
- `apps/web/src/styles.css`: global styling for the web UI.

The repository may not be initialized as a git working tree in local snapshots,
so do not depend on `git status` or `git diff` being available.

## Common Commands

Run commands from the repo root unless a task specifically needs a package cwd.

```sh
npm run dev
npm run dev:desktop
npm run typecheck
npm run build
npm run test
```

Focused web checks:

```sh
npm run typecheck -w @sfdc-profiler/web
npm run build -w @sfdc-profiler/web
```

Focused core checks:

```sh
npm run test -w @sfdc-profiler/core
npm run typecheck -w @sfdc-profiler/core
```

`npm run build -w @sfdc-profiler/web` currently completes but may emit Vite's
large chunk warning because `vis-timeline` is bundled into the app.

## Web App Structure

`apps/web/src/App.tsx` should stay as the app shell and coordinator:

- load and parse a selected log file
- restore/persist loaded logs through `logStorage.ts`
- track the active view: `summary`, `limits`, `rawLog`, `settings`, or `about`
- render sidebar navigation and the shared header metrics

Keep view-specific logic out of `App.tsx`:

- `components/summary`: summary view, slowest events, SOQL/DML summary lists
- `components/app`: app-level home/empty state and loaded-log header/navigation
- `components/timeline`: `vis-timeline` setup, timeline grouping, timeline
  formatting, timed-entry filtering
- `components/rawlog`: Monaco raw log viewer and raw log syntax/theme setup
- `components/limits`: top-level limits view plus shared chart/metric helpers
- `components/limits/soql`: SOQL limit section and query list
- `components/limits/dml`: DML limit section
- `components/limits/system`: CPU, heap, callout, future, queueable, and publish
  immediate limits

Shared web app types live in `apps/web/src/types.ts`. `logStorage.ts` is the
public persistence facade for loaded logs, recent logs, themes, and storage
clearing. Keep low-level browser storage details in `apps/web/src/storage`:

- `storage/indexedDbLogs.ts`: IndexedDB CRUD/cursor helpers
- `storage/hash.ts`: log/profile hash helpers
- `storage/urlLogHash.ts`: URL hash read/write helpers
- `storage/browserStorage.ts`: theme, quota estimate, and clear-storage helpers
- `storage/storageKeys.ts`: storage key names and versions

Summary split-pane behavior shared by the app shell lives in
`components/summary/useSummaryPaneResize.ts`; summary-view-only column and side
panel resizing stays in `components/summary/SummaryView.tsx`.

## Parser Notes

`parseApexLog` in `packages/core/src/parser.ts` returns an `ApexLogProfile`.
Keep `parser.ts` focused on the parse loop, event tree assembly, and metadata
merge flow. Adjacent parser helpers are split by responsibility:

- `parserFields.ts`: pipe-field parsing, line parsing, label parsing, and detail
  extraction
- `parserLimits.ts`: governor limit line parsing
- `parserExecutions.ts`: SOQL/DML execution summaries and SOQL duplicate
  normalization

Important fields used by the UI:

- `entries`: normalized log events with ids, timing, hierarchy, metadata, and
  limit details
- `rootIds`: root event ids for the parsed execution tree
- `limits`: grouped limit samples keyed by `limitTypes`
- `soqlExecutions`: query executions used by the SOQL limits view
- `executionTime`, `totalLines`, `processedLines`

When adding parser behavior, keep the core package independent of React,
Electron, DOM APIs, and browser storage.

## UI Conventions

- Use React function components and TypeScript types.
- Use `lucide-react` icons for navigation and controls when an icon is needed.
- Preserve the current panel/grid class names unless intentionally changing the
  visual design in `styles.css`.
- For timeline behavior, keep `vis-timeline` lifecycle code inside
  `components/timeline/TimelineView.tsx`.
- The timeline view is cached after first opening so selection links from limits
  can focus a timeline entry without rebuilding the view unnecessarily.
- SOQL query rows in the limits view call back to `App.tsx` through
  `onSelectTimelineEntry(entryId)`.

## Editing Guidance

- Prefer small, local changes that respect the current package boundaries.
- Do not move parser logic into the web app.
- Do not add browser or Electron dependencies to `packages/core`.
- Keep generated build output in `apps/web/dist` out of source-focused edits
  unless the task explicitly asks to update build artifacts.
- After web UI changes, run `npm run typecheck -w @sfdc-profiler/web`; run the
  web build when imports, bundling, or assets changed.
- After parser changes, run the core tests and typecheck.
