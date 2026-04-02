# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server using Fastify + tRPC, with XState actor systems and LMDB persistence
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — Action/prompt/flow/library DSL source + compiler (see `packages/default-setup/CLAUDE.md`). Compiles output to `packages/api/src/setup/seed/data/`

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Commands

```bash
npm start                # Dev mode (skips DSL generation)
npm run start:gen        # Dev mode with DSL generation
npm run build:be         # Build backend only
npm run build            # Build all workspaces
npm run build-prod       # Full production build (build/build.sh)

npm run typecheck        # Type check everything (FE + BE)
npm run typecheck:fe     # Frontend only (vue-tsc)
npm run typecheck:be     # Backend only (tsc --noEmit)
npm run test-build       # Verify FE + BE compile

npm test                 # Playwright E2E tests
npm run compile          # Compile all DSLs (actions, prompts, flows, library) from packages/default-setup

npm run db:cli           # Database CLI
npm run db:reset         # Reset database
```

## Architecture

### Event-driven actor system

Every backend **system** and frontend **plugin** is an XState state machine. They communicate via a central event bus:

- **Backend → Frontend**: `system.get(bus).send(emit(pluginName, { type, data }))`
- **Frontend → Backend**: `trpc.bus.send.mutate({ systemId, type, data })`
- **System → System**: `system.get(otherSystemId).send({ type })`

Systems define `IncomingSystemEvents` (Zod-validated), `SystemInternalEvents`, and `OutgoingSystemEvents`. See `packages/api/src/systems/CLAUDE.md` for the full pattern.

### Data layer (EARS)

Custom entity-attribute-relation graph database backed by LMDB. All data lives in memory.

- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: each system has `repository/` with `startup.ts`, `read.ts`, `create.ts`, `update.ts`

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. See `packages/renderer/src/plugins/CLAUDE.md` for the full pattern.

### Key patterns

- Every system/plugin must handle `CLIENT_CONNECTED` to send startup data
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK (LLM integration with Anthropic/OpenAI/Google), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
