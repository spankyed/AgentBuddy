

# Plugin - Actor - System
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

# Plugins

Plugins can define components they want to show in a specific area of the UI. A default and an active plugin, can be showing content at any given time.

The default plugin is set to be the `agent` plugin. Only the default plugin can define content to be shown in the chat area. The active plugin can show content in the canvas area and in the side panel (inspection panel). Below is an example of a common UI arrangement you'll see, where the default plugin is displaying content in chat area and in the side panel, while the active plugin is displaying some plugin specific UI in the canvas area.

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

Depending on what state a plugin is currently in, different content can be displayed in the canvas.
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
To define a canvas with component routing, you'll need to define the route components under `plugin.canvas` where `[key is TargetName]: Value is Component`. Than add a metadata object to the corresponding states like `meta: { ... breadcrumb('target', 'Title') }`. Example:
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
Systems are the building blocks for the agent. That is agent singular. I believe the current language around multiple agents interacting is confusing and unnecessary. Instead of multiple agents, we adopt multiple systems that make up a unified agent. Need more capabilities? Add more systems.

Systems can be started when the app starts up. Or a system can be spawned on the fly as needed. For example, the agent may be in the middle of working on a task, then a new task comes in. We can spin up a parallel system to handle this new task and orchestrate the two with a some parent system.

In a similar vein, systems can have child systems. This allows developers to orchestrate and encapsulate complex functionality behind a unified interface. Functionality which can be used by other backend systems or sent to plugins on the frontend.

Below is an example of sending a message to the `threads` frontend plugin from a backend system.
``` js
const pluginId = 'threads';

setup({
  actions: {
    sayHello: ({ system }) => {
      system.get(bus).send(emit(pluginId, {
        type: 'Hello',
        message: 'World'
      }));
    },
  }
})
.createMachine({ id: 'system' })
```

# Dialogs
```
                                          
╔═════════════════════════════════════════╗
║               Dialog Flow               ║
╚════════════════════╦════════════════════╝
     ┌────────┬──────┼──────┬────────┐     
     │        │      │      │        │     
     ▼        ▼      ▼      ▼        ▼     
     .        .      .      .        .     
    (█)      (█)    (█)    (█)      (█)    
     '        '      '      '        '     
     │        │      │      │        │     
  ┌──┴──┐     ▼      ▼      ▼     ┌──┴──┐  
  ▼     ▼     .      .      .     ▼     ▼  
  .     .    (█)    (█)    (█)    .     .  
 (█)   (█)    '      '      '    (█)   (█) 
  '     '            │            '     '  
        │            ▼                     
        ▼            .                     
        .           (█)                    
       (█)           '                     
        '                                  
```
Most of the time we don't need to code a new system to change the behavior of the agent. Instead we rely on a robust data model for expressing and exposing the flow of the application to the end-user (and in special cases to the agent itself).

The fundamental break through here is to imagine the agent <-> human interaction as navigating a dialog tree. And then to expand that model of a dialog tree to include at times agent<->agent dialog or even agent <-> application-event dialog.

In that sense, everything is an actor‑like dialog node, in which we have full control of our application and therefore our agent by just updating database records (dialog nodes).



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