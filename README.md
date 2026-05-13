# AgentBuddy

A desktop app for building and running AI agent workflows using an actor-based architecture.

## Features

- **Actor-based architecture** — XState state machines drive both frontend and backend, communicating through a typed event bus
- **Plugin system** — extend the app with plugins that register their own canvas views, panels, and state machines
- **LLM integration** — connect to Anthropic, OpenAI, and Google models via the Vercel AI SDK
- **Graph database** — custom entity-attribute-relation store (EARS) backed by LMDB for fast, in-memory data access
- **Visual node editor** — design agent flows with a drag-and-drop canvas powered by Vue Flow
- **Embedded terminal** — run commands directly inside the app with xterm.js and node-pty
- **Rich text editing** — author prompts and documentation with a Tiptap-based editor
- **Cross-platform** — runs on macOS, Windows, and Linux

## Tech Stack

Electron, Vue 3, XState v5, tRPC v11, Tailwind CSS, Vite, LMDB, Monaco Editor, Vercel AI SDK, Zod

## Project Structure

```
packages/
├── api/                  # Backend — Fastify + tRPC server, XState actor systems, LMDB persistence
│   ├── src/
│   │   ├── core/         # Server bootstrap, event bus, tRPC router
│   │   ├── repository/   # EARS graph database layer
│   │   ├── services/     # Shared services (LLM, embeddings, etc.)
│   │   ├── setup/        # Seed data, migrations, initialization
│   │   └── systems/      # Backend actor systems (actions, brain, flows, library, etc.)
│   └── tests/
├── default-setup/        # DSL source + compiler for actions, prompts, flows, library
│   ├── src/
│   │   ├── actions/
│   │   ├── flows/
│   │   ├── library/
│   │   └── prompts/
│   └── build/            # Compiler scripts
├── main/                 # Electron main process
│   └── src/modules/      # Window manager, API server launcher, security, etc.
├── preload/              # IPC bridge (contextBridge APIs)
├── renderer/             # Frontend — Vue 3 + Tailwind CSS
│   └── src/
│       ├── core/         # App shell, router, event bus client
│       ├── plugins/      # Frontend plugin actors (actions, flows, library, etc.)
│       └── setup/        # Plugin registration
└── electron-versions/    # Electron version management
```

## Prerequisites

- Node.js >= 23
- npm

## Getting Started

```sh
git clone https://github.com/spankyed/AgentBuddy.git
cd AgentBuddy
npm install
```

### Development

```sh
npm start                # Dev mode (skips DSL generation)
npm run start:gen        # Dev mode with DSL generation
```

### Build

```sh
npm run build            # Build all workspaces
npm run build:be         # Build backend only
npm run build-prod       # Full production build
```

### Test

```sh
npm test                 # Playwright E2E tests
npm run test:unit        # Unit tests
```

### Other Commands

```sh
npm run typecheck        # Type check all workspaces
npm run compile          # Compile all DSLs (actions, prompts, flows, library)
npm run db:cli           # Database CLI
npm run db:reset         # Reset database
```

## License

MIT
