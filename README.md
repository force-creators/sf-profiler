# SF Profiler

A modern Salesforce debug log profiler for Apex, Flow, SOQL, DML, and governor limits.

The project is organized so the parser/profiler logic can run in both a hosted
website and a local desktop app.

## Workspace

- `packages/core`: framework-free Salesforce debug log parser and profiler.
- `apps/web`: Vite + React browser app. Files are parsed locally in the browser.
- `apps/desktop`: Electron shell for the web app.

## Getting Started

```sh
nvm use
npm install
npm run dev
```

## Desktop

```sh
npm run dev:desktop
```

## macOS Installer Build

```sh
npm run dist:mac
```

Build artifacts are written to `apps/desktop/release/`.

For a distributable macOS build that Gatekeeper will accept, run the build on a Mac with a Developer ID Application certificate installed and set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` before invoking `npm run dist:mac`.
