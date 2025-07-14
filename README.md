# Agent-Buddy

**TL;DR**: A real-time, event-driven AI agent platform built on XState actors with pluggable UI components.

- **Full-duplex WebSocket communication** between typed backend systems and frontend plugins
- **Composable actor architecture** enabling parallel agent execution and system orchestration
- **Visual flow editor** for modifying agent behavior through data instead of code

![CI Status](https://img.shields.io/github/actions/workflow/status/agentbuddy/agentbuddy/ci.yml?branch=main)
![License](https://img.shields.io/badge/license-Private-red)
![TypeScript](https://img.shields.io/badge/TypeScript-≥5.7.2-blue)
![Release](https://img.shields.io/github/v/release/agentbuddy/agentbuddy)

## Table of contents

- [Agent-Buddy](#agent-buddy)
  - [Table of contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Architecture](#architecture)
    - [Backend systems](#backend-systems)
    - [Frontend plugins](#frontend-plugins)
    - [Communication flow](#communication-flow)
    - [Flows – the agent’s nervous system](#flows--the-agents-nervous-system)
      - [Core concepts](#core-concepts)
      - [Example: streaming GPT-4o tokens to the chat plugin](#example-streaming-gpt-4o-tokens-to-the-chat-plugin)
  - [Setup](#setup)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Development](#development)
  - [Contributing](#contributing)
    - [Development workflow](#development-workflow)
    - [Testing](#testing)
    - [Code style](#code-style)
  - [Project meta](#project-meta)
    - [Comparison with alternatives](#comparison-with-alternatives)
    - [License](#license)

## Introduction

Agent-Buddy provides a platform for building AI agents with consistent user experiences and 
extensible architectures. Unlike traditional agent frameworks that rely on rigid prompting 
schemes, Agent-Buddy uses an actor-based system architecture where both frontend and backend 
components communicate through typed events over WebSockets.

## Features

- **Actor-based architecture** using XState for predictable state management
- **Real-time bidirectional communication** via tRPC over WebSockets
- **Plugin system** for extending UI with canvas, panel, and chat areas
- **Hierarchical backend systems** that can spawn child actors dynamically
- **Visual flow editor** for agent behavior modification through dialog nodes
- **Hot-reloadable development** with Vite and TypeScript
- **Built-in systems** for threads, prompts, database queries, and logging
- **Time-travel debugging** through XState event replay
- **Monorepo structure** with pnpm workspaces and Turborepo
- **Type-safe communication** between frontend and backend

## Architecture

```
                         ┌─────────┐            ┌─────────┐                                   ┌─────────┐                         
                         │         │            │         │                                   │         │                         
  ╔═════════╗            │         │            │         │            ╔═════════╗            │         │            ╔═════════╗  
  ║ plugins ║            │         │            │         │            ║ systems ║            │         │            ║  flows  ║  
┌─╩═════════╩─┐          │         │            │         │          ┌─╩═════════╩─┐          │         │          ┌─╩═════════╩─┐
│    Brain    │ ◀──────▶ │         │            │         │ ◀──────▶ │    Brain    │ ◀──────▶ │         │ ◀──────▶ │  Run Brain  │
├─────────────┤          │         │            │         │          ├─────────────┤          │         │          ├─────────────┤
│    Agent    │ ◀──────▶ │         │  ◀───────  │         │ ◀──────▶ │    Agent    │          │         │ ◀──────▶ │ User Message│
├─────────────┤          │         │ ┌────────┐ │         │          ├─────────────┤          │         │          └─────────────┘
│   Threads   │ ◀──────▶ │   Web   │ │  http  │ │ Backend │ ◀──────▶ │   Threads   │          │  Brain  │                         
├─────────────┤          │   Bus   │ └────────┘ │   Bus   │          ├─────────────┤          │   Bus   │                         
│   Prompts   │ ◀──────▶ │         │  ───────▶  │         │ ◀──────▶ │   Prompts   │          │         │                         
├─────────────┤          │         │            │         │          ├─────────────┤          │         │                         
│    Files    │ ◀──────▶ │         │            │         │ ◀──────▶ │    Files    │          │         │                         
├─────────────┤          │         │            │         │          ├─────────────┤          │         │                         
│    Code     │ ◀──────▶ │         │            │         │ ◀──────▶ │    Code     │          │         │                         
└─────────────┘          │         │            │         │          └─────────────┘          │         │                         
                         │         │            │         │                                   │         │                         
                         │         │            │         │                                   │         │                         
                         │         │            │         │                                   │         │                         
                         └─────────┘            └─────────┘                                   └─────────┘                          
```
![Agent-Buddy Architecture](docs/architecture.svg)
*Alt: Diagram showing backend systems communicating through a central bus, connected via WebSocket to frontend plugins managing different UI areas*

### Backend systems

Backend systems are autonomous XState actors that encapsulate specific functionality. Each system:
- Communicates through a central event bus
- Can spawn child systems for complex orchestrations
- Handles typed events from frontend plugins
- Persists state using SQLite with Drizzle ORM

Example system structure:
```ts
// systems/example/system.ts
export const exampleSystem = setup({
  actions: {
    notifyPlugin: ({ system, event }) =>
      system.get(bus).send(
        emit('example-plugin', { 
          type: 'DATA_UPDATED',
          payload: event.data 
        })
      ),
  },
}).createMachine({
  id: 'example',
  initial: 'idle',
  states: {
    idle: {
      on: { 
        PROCESS_DATA: { 
          target: 'processing',
          actions: ['validateData', 'notifyPlugin'] 
        } 
      },
    },
    processing: {
      // Processing logic here
    },
  },
});
```

### Frontend plugins

Plugins define UI components and state management for specific features. Each plugin includes:
- XState machine for local state management
- Vue 3 components for canvas, panel, and optionally chat areas
- Event handlers for system communication

```
                        │                            │                                      
                        │                            │    ╔════════════════════════════════╗
╔══════════════════╗    │    ╔══════════════════╗    │    ║  What's currently being shown  ║
║  Default Plugin  ║    │    ║  Active Plugin   ║    │    ╚══╦═════════════════╦═══════╦═══╝
╠════════════╦═════╣    │    ╠════════════╦═════╣    │       │█████████████████│███████│    
│            │█ I █│    │    │████████████│     │    │       │█████████████████│██   ██│    
│            │█ n █│    │    │██ Canvas ██│     │    │       │█████ Canvas ████│██ I ██│    
│            │█ s █│  ╔═╩═╗  │████████████│     │  ╔═╩═╗     │█████████████████│██ n ██│    
├────────────┤█ p █│  ║ + ║  ├────────────┤     │  ║ = ║     │█████████████████│██ s ██│    
│████████████│█ e █│  ╚═╦═╝  │            │     │  ╚═╦═╝     ├─────────────────┤██ p ██│    
│███ Chat ███│█ c █│    │    │            │     │    │       │█████████████████│██ e ██│    
│████████████│█ t █│    │    │            │     │    │       │█████████████████│██ c ██│    
└────────────┴─────┘    │    └────────────┴─────┘    │       │██████ Chat █████│██ t ██│    
                        │                            │       │█████████████████│██   ██│    
                        │                            │       │█████████████████│███████│    
                        │                            │       └─────────────────┴───────┘    
                        │                            │                                      
```
![Plugin Communication Flow](docs/sequence.svg)
*Alt: Sequence diagram showing user interaction triggering plugin event, sent via WebSocket to backend system, which processes and responds*

### Communication flow

1. User interacts with plugin UI component
2. Plugin sends typed event through tRPC WebSocket connection
3. Backend bus routes event to appropriate system(s)
4. System processes event and emits response
5. Response routed back to specific plugin(s)
6. Plugin updates UI based on response


### Flows – the agent’s nervous system

> **Why they matter**  
> Systems and plugins give Agent-Buddy its extensible shell, but **flows** define the
> _actual behaviour_ of every agent. A flow is a directed graph of **steps**
> (nodes) that listen for events, transform data, call LLMs, or run custom code.
> Updating an agent is therefore a **data operation** (editing the graph) rather
> than a code change.

![Flow editor screenshot](docs/flows_editor.png)
*Alt: Screenshot of the visual flow editor showing a “User Message → Process User Message → Format Response → Stream to FE” pipeline, with an event trace panel on the right.*

#### Core concepts

| Concept        | Description                                                      |
|----------------|------------------------------------------------------------------|
| **Step**       | A single node in the graph (Listen, Query, LLM, Action, etc.).   |
| **Flow**       | A named collection of steps with one or more entry points.       |
| **Event**      | Typed message that triggers a Listen step (`USER_MESSAGE`, etc). |
| **Custom Action** | User-supplied JS/TS function executed inside a sandbox.        |

#### Example: streaming GPT-4o tokens to the chat plugin

1. **Listen step** &nbsp;`USER_MESSAGE` → captures raw user message.  
2. **LLM step** &nbsp;`Process User Message` → summarises intent.  
3. **LLM step** &nbsp;`Format Response` → converts summary into prose.  
4. **Action step** &nbsp;`Stream to FE` → runs the custom code below, pushing
   tokens back to the **agent** plugin in real-time.

```ts
// actions/streamToFe.ts
const actionFn = tidyFunction(`
  const { message } = params;

  const result = await services.llm.streamText({
    model: { provider: 'openai', model: 'gpt-4o' },
    prompt: message,
    system: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 100,
  });

  for await (const textPart of result.textStream) {
    services.logger.info('Streaming text', { textPart });
    services.emitter.sendToPlugin('agent', {
      type: 'TOKEN_STREAM',
      token: textPart,
    });
  }

  await result.finishReason;

  services.emitter.sendToPlugin('agent', { type: 'LLM_DONE' });
`);


## Quick demo

![Agent-Buddy Demo](docs/demo.gif)
*Alt: Screen recording showing real-time agent interaction with visual flow editor and live updates*

### Minimal plugin example

```ts
// plugins/hello/plugin.ts
import { setup, createMachine } from 'xstate';
import { definePlugin } from '@/core';
import Canvas from './canvas.vue';

const state = setup({
  actions: {
    logEvent: ({ event }) => console.log('Received:', event),
  },
}).createMachine({
  id: 'hello',
  initial: 'ready',
  states: {
    ready: {
      on: {
        GREET: {
          actions: ['logEvent'],
        },
      },
    },
  },
});

export default definePlugin({
  id: 'hello',
  label: 'Hello Plugin',
  state,
  canvas: Canvas,
});
```

## Setup

### Prerequisites

- Node.js ≥ 20 LTS
- pnpm ≥ 10.10.0
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/agentbuddy/agentbuddy.git
cd agentbuddy

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env

# Start development servers
pnpm run dev && open http://localhost:5173
```

### Development

Common commands:

```bash
# Build frontend only
pnpm fe

# Build backend with type definitions
pnpm be

# Run all tests
pnpm test

# Run linting
pnpm lint

# Type checking
pnpm typecheck
```

For VS Code users, configure TypeScript version in `.vscode/settings.json`:
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## Contributing

We welcome contributions! Please follow these guidelines:

### Development workflow

1. Fork the repository
2. Create a feature branch: `feature/your-feature-name`
3. Make your changes following our code style
4. Write or update tests as needed
5. Submit a pull request with clear description

### Testing

```bash
# Run all tests
pnpm test

# Run backend tests only
pnpm test:be

# Run tests in watch mode (frontend)
cd apps/web && pnpm test:watch

# Run tests with UI
cd apps/web && pnpm test:ui
```

### Code style

- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Ensure `pnpm lint` and `pnpm typecheck` pass
- Write tests for new features
- Keep commits focused and atomic

For detailed guidelines, see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Project meta

### Comparison with alternatives

| Feature | Agent-Buddy | LangChain | Autogen | CrewAI |
|---------|------------|-----------|---------|---------|
| Real-time WebSocket | ✅ | ❌ | ❌ | ❌ |
| Plugin UI system | ✅ | ❌ | ❌ | ❌ |
| Event-driven architecture | ✅ | Partial | ❌ | ❌ |
| Visual flow editor | ✅ | ❌ | ❌ | ❌ |

### License

Private project - All rights reserved