# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Electron application built with a Vite + Vue 3 frontend and a TypeScript backend. The architecture uses XState state machines for both frontend and backend state management, with an event-driven, actor-based pattern.

## Essential Commands

### Development
```bash
# Install all dependencies
npm install

# Start the application in development mode (hot-reload)
npm start

# Run backend API server only
cd packages/api && npm run dev

# Run frontend only  
cd packages/renderer && npm run dev
```

### Building & Testing
```bash
# Build all packages
npm run build

# Type check all packages
npm run typecheck

# Compile executable
npm run compile

# Run E2E tests (requires compiled app)
npm run test

# Run unit tests in API package
cd packages/api && npm run test

# Run frontend linting
cd packages/renderer && npm run lint
```

## Architecture Overview

### High-Level Structure

The application follows a monorepo structure with three main packages:

1. **packages/main** - Electron main process (window management, auto-updates)
2. **packages/preload** - Bridge between renderer and Node.js APIs
3. **packages/renderer** - Vue 3 frontend with plugin-based UI
4. **packages/api** - Backend API server with system actors

### Backend Architecture (packages/api)

The backend uses an event-driven, actor-based architecture:

- **System Actors**: Each system (agent, brain, flows, etc.) is an independent XState actor
- **Event Bus**: Central bus coordinates communication between systems
- **Repository Pattern**: Each system has a repository for data operations
- **EARS**: Custom in-memory graph database for entity storage

Key systems:
- **agent**: AI conversation interface
- **brain**: Executes dialog flows and steps
- **flows**: Visual flow editor and node configurations
- **threads**: Conversation/thread management
- **database**: EARS database viewer for debugging

### Frontend Architecture (packages/renderer)

The frontend uses a plugin-based architecture:

- **Plugins**: Each major feature is a plugin with its own state machine
- **Canvas/Panel**: Plugins can render in main canvas and/or side panel
- **State Management**: XState actors manage plugin state
- **Backend Communication**: TRPC over WebSocket for type-safe API calls

### Communication Flow

```
Renderer (Vue) ↔ Preload ↔ Main Process
     ↓              ↑
   TRPC          WebSocket  
     ↓              ↑
Backend API (XState Systems)
```

## Key Patterns

### Adding Backend Systems

1. Create system in `/packages/api/src/systems/[name]/`
2. Define events in `system.ts` using `systemBus()` helper
3. Register in `/packages/api/src/systems/index.ts`
4. Handle `CLIENT_CONNECTED` event to send initial data

### Adding Frontend Plugins

1. Copy `/packages/renderer/src/plugins/_blank/` template
2. Define plugin structure in `plugin.ts`
3. Implement state machine in `state.ts`
4. Create Vue components for canvas/panel
5. Register in `/packages/renderer/src/plugins/index.ts`

### Event Communication

Backend to Frontend:
```typescript
system.get(bus).send(emit(pluginName, { type: 'EVENT', data }));
```

Frontend to Backend:
```typescript
await trpc.bus.send.mutate({ systemId, type: 'EVENT', data });
```

## Development Notes

- The project uses Node.js 23+ and requires native modules (node-pty, better-sqlite3)
- Environment variables prefixed with `VITE_` are exposed to the frontend
- The electron app is currently in the `electron-app` directory (branch AS/electorn-2)
- All backend data is stored in memory using the EARS graph database
- Frontend uses Tailwind CSS with a custom design system
- State machines should handle `PLUGIN_ACTIVATED` and `CLIENT_CONNECTED` events