# AgentBuddy

A desktop app for building and running AI agent workflows using an actor-based architecture.

## Features

- **Actor-based architecture** — XState state machines drive both frontend and backend, communicating through a typed event bus
- **Plugin system** — extend the app with plugins that register their own canvas views, panels, and state machines
- **LLM integration** — connect to Anthropic, OpenAI, and Google models via the Vercel AI SDK
- **Graph database** — custom entity-attribute-relation store backed by LMDB for fast, in-memory data access
- **Visual node editor** — design agent flows with a drag-and-drop canvas powered by Vue Flow
- **Embedded terminal** — run commands directly inside the app with xterm.js and node-pty
- **Rich text editing** — author prompts and documentation with a Tiptap-based editor

## Tech Stack

Electron, Vue 3, XState v5, tRPC, Tailwind CSS, Vite, LMDB, Monaco Editor

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
└── renderer/             # Frontend — Vue 3 + Tailwind CSS
    └── src/
        ├── core/         # App shell, router, event bus client
        ├── plugins/      # Frontend plugin actors (actions, flows, library, etc.)
        └── setup/        # Plugin registration
```

## Prerequisites

- Node.js &gt;= 23
- npm

## Getting Started

```sh
git clone https://github.com/anthropics/AgentBuddy.git
cd AgentBuddy
npm install
```

### Run in development

```sh
npm start
```

### Build for production

```sh
npm run build
```

### Run tests

```sh
npm test
```

## License

MIT