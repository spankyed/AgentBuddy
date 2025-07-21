# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Project Overview
AgentBuddy is a "vibe-working platform" - an AI agent platform built with a focus on user experience and extensibility. The architecture emphasizes composable systems and plugins to create a flexible, scalable agent experience.


## Essential Commands
### Development
```bash
# Install dependencies (use pnpm v10.10.0)
pnpm install

# re-build frontend only (ensure app compiles without type errors)
pnpm fe

# re-build backend (along with schema layer / type definitions from BE which are used on FE)
pnpm be
```

### Testing
```bash
# Run all tests
pnpm test

# Run backend tests only
pnpm test:be

# Run tests in watch mode (frontend)
cd apps/web && pnpm test:watch

# Run tests in watch mode (backend)
cd apps/api && pnpm test:watch

# Run tests with UI (frontend)
cd apps/web && pnpm test:ui
```

### Code Quality
```bash
# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```


## High-Level Architecture
### 1. Actor-Based System Architecture
The entire application is built on an **actor model** using **XState** state machines. Both frontend and backend use XState extensively for state management and inter-component communication.

### 2. Frontend Architecture (Vue 3 + XState)
- **Location**: `/apps/web`
- **Stack**: Vue 3, TypeScript, Vite, XState, TailwindCSS, tRPC
- **Plugin System**: Features are encapsulated as plugins with:
  - State machine (`state.ts`)
  - UI components (`canvas.vue`, `panel.vue`, optionally `chat.vue`)
  - Plugin definition and metadata (`plugin.ts`)
- **Main UI Areas**:
  1. Toolbar (left): Plugin navigation
  2. Canvas: Main workspace (changes per plugin)
  3. Chat: Persistent area (only default plugin renders here)
  4. Inspection Panel: Context-sensitive sidebar

### 3. Backend Architecture (Node.js + XState)
- **Location**: `/apps/api`
- **Stack**: Node.js, Fastify, TypeScript, XState, tRPC, SQLite, Drizzle ORM
- **System-Based**: Features are "systems" that communicate via a central bus
- **Key Systems**:
  - `agent`: Main AI agent logic
  - `brain`: Dialog flow/step execution engine
  - `threads`: Conversation management
  - `prompts`: Prompt template management
  - `flows`: Visual flow editor data
  - `database`: Query execution
  - `logs`: Logging infrastructure

### 4. Communication Pattern
```
Frontend Plugin → tRPC WebSocket → Backend Bus → Backend System
Backend System → Backend Bus → tRPC WebSocket → Frontend Plugin
```
- Real-time bidirectional communication using tRPC over WebSockets
- Typed events: `IncomingSystemEvents` (frontend→backend) and `OutgoingSystemEvents` (backend→frontend)

### 5. Creating New Features
#### New Frontend Plugin:
1. Copy `/apps/web/src/plugins/_blank` template
2. Define state machine with proper types
3. Create UI components (canvas required, panel optional)
4. Export plugin object with id, label, icon, state, and components
5. Register in `/apps/web/src/plugins/index.ts`

#### New Backend System:
1. Create folder under `/apps/api/src/systems/`
2. Define state machine in `system.ts`
3. Define types in `types.ts`
4. Add repository functions if needed
5. Register in `/apps/api/src/systems/index.ts`

## Key Files to Understand
- `/apps/web/src/plugins/index.ts`: Frontend plugin registry
- `/apps/api/src/systems/index.ts`: Backend system registry
- `/apps/web/src/core/actors/application.ts`: Frontend message bus and central/root plugin
- `/apps/api/src/systems/_backend/backend.ts`: Backend message bus and central/root system
- `/apps/api/src/shared/ears/helpers/query.ts`: Query builder for EARS entities
- `/apps/api/src/shared/ears/helpers/transaction.ts`: Transaction builder for EARS entities
- `/apps/api/src/types.ts`: Schema layer aka type definitions for FE (no runtime types can be used by FE, e.g. enums)

## Important Patterns
1. **State Machines Everywhere**: Use XState for complex state management
2. **Event-Driven Communication**: Systems communicate through typed events
3. **Mock Data First**: Systems can start with mock-data for development
5. **Monorepo Structure**: Using pnpm workspaces with turborepo


## Core Concepts
- **Dialog Flows & Steps**: Agent behavior is controlled through configurable dialog flows, allowing modification through data rather than code
- **EARS**: Entity-Attribute-Relationship-System for data modeling
- **Breadcrumb Navigation**: Sub-routing within plugins using state machine states
- **Visual Programming**: The platform supports visual flow editors and node-based interfaces


## Project Glossary
### Core Architecture Terms
- **System**: A self-contained backend module that provides specific functionality. Systems communicate through the bus and can have child systems
- **Plugin**: Frontend module that defines UI interfaces for specific areas (canvas, panel, chat). Multiple plugins can be active simultaneously
- **Bus**: The central event-driven communication channel enabling full-duplex communication between frontend and backend
- **Actor**: XState state machine instances that can spawn child actors and communicate through events

### EARS Framework
- **Entity**: Core data objects (Agent, Brain, Message, Thread, Flow, Node, Prompt, etc.) with unique EntityId format: `{EntityType}-{string}`
- **Attributes**: Entity attributes (name, description, etc.)
- **Relations**: Relationship types between entities (parent_of, contains, replied_to, has, blocks, depends_on, relates_to, transitions_to, instance_of, spawned, tracked)
- **Roles**: Roles assignable to entities through the role attribute system

### Communication
- **Full Duplex**: Bidirectional communication capability between web and backend buses
- **IncomingSystemEvents**: Events sent from frontend to backend
- **OutgoingSystemEvents**: Events sent from backend to frontend (always include pluginId)
- **Emit**: Function to send events from backend systems to frontend plugins through the bus

## Vue Component Best Practices
- **NEVER use defineExpose()**: This is an anti-pattern. Vue components should communicate through props and events only
- **Parent-Child Communication**: Use props down, events up pattern exclusively
- **No Direct Method Calls**: Never call child component methods directly from parent components
- **Event-Driven**: All component interactions should be through well-defined events
