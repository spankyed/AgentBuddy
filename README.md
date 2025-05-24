
<h1 align="center">Agent-Buddy</h1>
<p align="center"><strong>A vibe-working platform</strong></p>

<p align="center">
Current AI agent platforms provide inconsistent experiences and struggle to scale effectively where it matters, causing users to become frustrated. Despite being young, many platforms feel outdated due to rigid prompting schemes and limited extensibility options. Agent-Buddy was built with a different approach in mind. An approach guided by a clear-eyed vision to create a tool that aligns deeply with user needs.
</p>

<p align="center"><strong>Please join us in bringing better vibes with the Agent‑Buddy platform</strong></p>

# Systems
```
╔═════════════════════════════════════════════════════════════════════════════════════╗ 
║                                        Agent                                        ║░
╠─────────────────────────╦═══╦─────────────────────────╦═══╦─────────────────────────╣░
│                         │░░░│                         │░░░│                         │░
│         System A        │░  │         System B        │░  │                         │░
│                         │░  │                         │░  │        System C         │░
│┌─────────┐   ┌─────────┐│░┌▶│┌─────────┐   ┌─────────┐│░─▶│                         │░
││ Sys. a1 │──▶│ Sys. a2 ││░│ ││ Sys. b1 │──▶│ Sys. b2 ││░  │                         │░
│└─────────┘   └─────────┘│░┘ │└─────────┘   └─────────┘│░  │                         │░
│       ┌─────────┐ │     │░  │                         │░  └─────────────────────────┘░
│       │ Sys. a3 │◀┘     │░  └─────────────────────────┘░   ░░░░░░░░░░░░░░░░░░░░░░░░░░░
│       └─────────┘       │░   ░░░░░░░░░░░░░░░░░░░░░░░░░░░                              
│                         │░                                                            
└─────────────────────────┘░                                                            
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░                                                            
```
Systems provide the foundation for a unified agent. Need more capabilities? Add more systems.

Systems should primarily be used to provide integrations for external services or to make available custom functionality that isn't currently supported by the core framework like video generation.

Systems can have child systems. Allowing developers to orchestrate and encapsulate complex functionality behind a unified interface. Functionality which can be used and interacted with by other backend systems or by plugins on the frontend.

Systems can be started when the app starts up. Or a system can be spawned on the fly as needed. For example, the agent may be in the middle of working on a task, then a new task comes in. We can spin up a parallel system to handle this new task and orchestrate the two with some parent system. However, this particular use-case is better handled using dialog steps, discussed further down. 

```
                           ┌─────────┐            ┌─────────┐                           
                           │         │            │         │                           
  ╔═════════╗              │         │            │         │              ╔═════════╗  
  ║ plugins ║              │         │            │         │              ║ systems ║  
┌─╩═════════╩─┐     ┌───── │         │            │         │ ────┐      ┌─╩═════════╩─┐
│    Brain    │ ◀───┘      │         │            │         │     └────▶ │    Brain    │
├─────────────┤            │         │  ◀───────  │         │            ├─────────────┤
│    Agent    │ ───────▶   │         │            │         │   ◀─────── │    Agent    │
├─────────────┤            │         │ ┌────────┐ │         │            ├─────────────┤
│   Threads   │ ───────▶   │   Web   │ │  Full  │ │ Backend │   ◀─────── │   Threads   │
├─────────────┤            │   Bus   │ │ Duplex │ │   Bus   │            ├─────────────┤
│   Prompts   │ ───────▶   │         │ └────────┘ │         │   ◀─────── │   Prompts   │
├─────────────┤            │         │            │         │            ├─────────────┤
│    Files    │ ───────▶   │         │  ───────▶  │         │   ◀─────── │    Files    │
├─────────────┤            │         │            │         │            ├─────────────┤
│    Code     │ ───────▶   │         │            │         │   ◀─────── │    Code     │
└─────────────┘            │         │            │         │            └─────────────┘
                           │         │            │         │                           
                           │         │            │         │                           
                           │         │            │         │                           
                           └─────────┘            └─────────┘                           
```

Below is an example code snippet for sending a message to a frontend plugin from a backend system. A working understanding of [Xstate](https://stately.ai/docs/state-machines-and-statecharts) and state-machines is highly recommended, as they are used ubiquitously throughout the FE and BE. 
``` js
const pluginId = 'threads';

setup({
  actions: {
    sendHello: ({ system }) =>
      system.get(bus).send(
        emit(pluginId, { type: 'GREET', message: '🌍 Hey, User!' })
      ),
  },
})
.createMachine({
  id: 'system',
  initial: 'idle',
  states: {
    idle: {
      on: { STARTUP: { target: 'working', actions: 'sendHello' } },
    },
    working: { },
  },
});
```

# Dialogs - Flows & Steps
Dialog flows and steps are used as the building blocks for agent modification. Most of the time we don't need to code a new system to change the behavior of the agent. Instead we rely on a robust data model for expressing and exposing the flow of the application, allowing the agent to be extended through new data, not new code.

A way to think of this is to imagine an `agent <-> user` interaction as the user navigating some dialog tree. Then expanding that model of a dialog tree to include at times `agent <-> agent` dialog, `agent <-> application-event` dialog, and even `application-event <-> application-event` (since the core logic is built using [actors](https://stately.ai/docs/state-machine-actors#:~:text=State%20machine%20actors%20are%20actors,about%20state%20machines%20in%20depth.) and state machines).

In that sense, everything is composable through this node-like dialog interface, allowing users and developers full control of the application and therefore the agent by just reorganizing the flow of dialog nodes.
```
                                                                        
               ╔═════════════════════════════════════════╗               
               ║               Dialog Flow               ║               
               ╚════════════════════╦════════════════════╝               
                                    │                                    
    ┌────────┬──────┬──────┬────────┼────────┬──────┬──────┬────────┐    
    │        │      │      │        │        │      │      │        │    
    ▼        ▼      ▼      ▼        ▼        ▼      ▼      ▼        ▼    
    .        .      .      .        .        .      .      .        .    
   (█)      (█)    (█)    (█)      (█)      (█)    (█)    (█)      (█)   
    '        '      '      '        '        '      '      '        '    
    │        │      │      │        │        │      │      │        │    
 ┌──┴──┐     ▼      ▼      ▼     ┌──┴──┐     ▼      ▼      ▼     ┌──┴──┐ 
 ▼     ▼     .      .      .     ▼     ▼     .      .      .     ▼     ▼ 
 .     .    (█)    (█)    (█)    .     .    (█)    (█)    (█)    .     . 
(█)   (█)    '      '      '    (█)   (█)    '      '      '    (█)   (█)
 '     '            │            '     '     │      │            '     ' 
       │            ▼            │           ▼      ▼                    
       ▼            .            ▼           .      .                    
       .           (█)           .          (█)    (█)                   
      (█)           '           (█)          '      '                    
       '                         '                                       
```

# Plugins
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

Plugins allow developers the ability to define interfaces for a specific area of the UI. A default and an active plugin can be showing content at any given time.

The "default plugin" is set to be the `agent` plugin by default. Only the default plugin can define content to be shown in the chat area. The active plugin can show content in the canvas area and in the side panel, aka inspection panel. Below is an example of a common UI arrangement you'll see, where the default plugin is displaying content in chat area and in the side panel, while the active plugin is displaying some plugin specific UI in the canvas area.

``` yml
Basic Plugin Skeleton:

📦 _blank
 ┣ 📜 canvas.vue  -- main workspace
 ┣ 📜 panel.vue   -- sidebar panel
 ┣ 📜 plugin.ts   -- entry file; exports state & components
 ┗ 📜 state.ts    -- XState machine for plugin logic
```
``` js
// plugin.ts
export const _blankPlugin = {
  id: '_blank',
  label: 'Blank',
  icon: Box,
  state,
  canvas,
  panel,
}; // Expose a plugin by defining a plugin object
```

### Canvas sub-routing
With sub-routes, a plugin can display different components or pages depending on what state the plugin is currently in.
```
                                                                  
╔════════════════════════════════════════╗     Bread > Crumbs     
║        Canvas Component Routes         ║     ┌────────────┬────┐
╠════════════╦╦════════════╦╦════════════╣     │            │████│
│            ││            │║████████████║     │   Canvas   │████│
│    List    ││   Create   │║███ View ███║  ┌──│   Target   │████│
│            ││            │║████████████║  │  │            │████│
└────────────┘└────────────┘╚════════════╝  │  ├────────────┤████│
                                   ▲        │  │████████████│████│
                                   │        │  │████████████│████│
                                   └────────┘  │████████████│████│
                                               │████████████│████│
                                               └────────────┴────┘
```
To define a plugin with sub-routes, you'll need to define the route components under `plugin.canvas` where `[key is TargetName]: Value is Component`. Than add a metadata object like `{ ...breadcrumb('target', 'Title') }` to the corresponding states. Example:
``` js
// plugin.ts
const plugin = {
  id: 'plugin',
  // ...
  canvas: {
    list,
    create,
    view,
  },
  panel,
};

// state.ts
createMachine({
  id: 'plugin',
  initial: 'list',
  states: {
    // ...
    'create': {
      meta: { ...breadcrumb('create', 'New Thread') },
      on: {
        CREATE_THREAD: { ... },
        CANCEL_CREATE: { target: 'list' },
      },
    },
  },
})
```

# Getting Started

From root run:
```
pnpm install
pnpm be        # tsc --watch + nodemon
pnpm fe        # Vite + Tailwind
pnpm run dev
```

# Requirements
### tRPC TypeScript version requirement

<blockquote>
TypeScript version >=5.7.2 is now required (non-breaking)
tRPC now requires TypeScript version 5.7.2 or higher. This change was made in response to a bug report where we decided to take a forward-looking approach.

If you try to install tRPC with an unsupported TypeScript version, you'll receive a peer dependency error during installation.

If you notice your editor showing any types, it's likely because your editor isn't using the correct TypeScript version. To fix this, you'll need to configure your editor to use the TypeScript version installed in your project's package.json.

For VSCode users, add these settings to your .vscode/settings.json:
</blockquote>

`.vscode/settings.json`
```
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## License

Private project - All rights reserved