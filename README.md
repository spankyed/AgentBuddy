# AgentBuddy

AgentBuddy is an Electron desktop app for building and running AI agent workflows. It combines a Vue-based visual workspace with an actor-driven backend, plugin-defined tools, local persistence, and model integrations.

## Features

- **Actor-based runtime**: XState state machines coordinate frontend and backend behavior through a typed event bus.
- **Packs**: Features (backend systems and frontend plugins), flow steps, seeds, artifacts and blocks ship as packs, built with the `abuddy` CLI. The app's own features are the built-in `default-setup` pack.
- **Model integrations**: Anthropic, OpenAI, Google, Groq, Mistral and Cohere, through the Vercel AI SDK.
- **Local graph store**: The EARS entity-attribute-relation store is backed by LMDB for fast local access.
- **Visual flow editor**: Vue Flow powers drag-and-drop authoring for agent flows.
- **Embedded terminal**: xterm.js and node-pty provide command execution inside the app.
- **Rich text editing**: Tiptap supports prompt and documentation authoring.
- **Desktop packaging**: Electron targets macOS, Windows, and Linux.

## Tech Stack

- Electron
- Vue 3
- XState v5
- tRPC v11
- Tailwind CSS
- Vite
- LMDB
- Monaco Editor
- Vercel AI SDK

## Project Structure

```
packages/
├── api/                  # Backend: node:http + ws + tRPC server that loads packs and runs their systems
│   └── src/
│       ├── core/         # EARS and persistence wiring, tRPC routers, shared helpers
│       ├── packs/        # Pack loading, activation, reload and seeding
│       ├── setup/        # Boot sequence, migration runner, websocket
│       └── systems.ts    # Bus and host systems
├── default-setup/        # The built-in pack: features, steps, seeds, migrations (abuddy.json)
│   └── src/
│       ├── features/     # One folder per feature: be/ (system) and fe/ (plugin)
│       ├── extensions/   # Steps, artifacts, blocks, services, tiptap plugins
│       ├── seeds/        # Actions, prompts, flows, library, notes, FAQs, settings
│       ├── migrations/
│       └── defs/         # Monaco DSL type definitions
├── abuddy-sdk/           # @abuddy/sdk: pack-facing API (EARS, framework, steps, build pipeline)
├── abuddy-ui/            # @abuddy/ui: Vue components, editors and composables
├── abuddy-cli/           # @abuddy/cli: the abuddy command
├── abuddy-testing/       # @abuddy/testing: unit test harness and Playwright fixture
├── abuddy-host/          # @abuddy/host (private): pack registry and installer, bus, secrets, host services
├── main/                 # Electron main process
│   └── src/modules/      # Window manager, API server launcher, pack:// and media protocols, etc.
├── preload/              # IPC bridge (contextBridge APIs)
├── renderer/             # Frontend: Vue 3 + Tailwind CSS app shell
│   └── src/
│       ├── core/         # Application actor, components, tRPC client
│       └── packs/        # Pack frontend loading and the packs plugin
├── typescript-floor/     # TypeScript 5.7, the oldest @abuddy/sdk and @abuddy/ui support, for type tests
└── electron-versions/    # Electron version management
```

## Prerequisites

- Node.js 23 or newer
- npm 10 or newer

## Getting Started

```sh
git clone https://github.com/spankyed/AgentBuddy.git
cd AgentBuddy
npm install
```

The repository uses npm workspaces under `packages/*`. The root scripts coordinate builds, tests, type checking, DSL compilation, database tasks, and Electron development mode.

### Development

```sh
npm start                # Dev mode (skips DSL generation)
npm run start:gen        # Dev mode with DSL generation
npm run start:inspect    # Dev mode with Electron inspection enabled
```

### Build

```sh
npm run build            # Build all workspaces
npm run build:be         # Build backend only
npm run build-prod       # Full production build
npm run package:all      # Package for macOS, Windows, and Linux
```

### Test

```sh
npm test                 # Playwright E2E tests
npm run test:unit        # Unit tests (api, default-setup, host)
npm run typecheck        # Type checks for every workspace, plus import specifier and UI entry checks
```

### Default Setup

The built-in pack's seeds (actions, prompts, flows, library, notes, FAQs, settings) are TypeScript and markdown sources that its build compiles.

```sh
npm run compile          # Build the default-setup pack (abuddy build, DSL defs, runtime)
```

### Database Tools

```sh
npm run db:cli           # Database CLI
npm run db:exec          # Execute a database CLI command
npm run db:script        # Run a database script
npm run db:reset         # Reset database
```

## Development Notes

- `npm start` runs `packages/dev-mode.js`: it builds the backend, watches the default-setup pack, starts the renderer dev server and launches Electron.
- `npm run start:gen` also regenerates DSL type definitions (Monaco intellisense) before launching.
- Backend build output is produced by `@app/api`; frontend build output is produced by `@app/renderer`.
- Production signing uses `.env.signing`; start from `.env.signing.example` when preparing signed builds.

## License

MIT
