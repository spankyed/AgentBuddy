

# Plugin - Actor - System
```
  ┌─────────┐              ┌─────────┐            ┌─────────┐              ┌─────────┐  
  │ plugins │              │         │            │         │              │ systems │  
  └─────────┘              │         │            │         │              └─────────┘  
                           │         │            │         │                           
┌─────────────┐     ┌───── │         │            │         │ ────┐      ┌─────────────┐
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

Plugins define what gets shown in a specific area of the UI. Two plugins, the default and active plugins, can be showing content at any given time.

Only the default plugin can define content to be shown in the chat area. The canvas and the inspection panel can be toggled to show custom content from the currently active plugin. Below is an example of a common UI arrangement you'll see.

```
                      │                            │                                      
                      │                            │    ╔════════════════════════════════╗
╔════════════════╗    │     ╔════════════════╗     │    ║  What's currently being shown  ║
║ Default Plugin ║    │     ║ Active Plugin  ║     │    ╚══╦═════════════════╦═══════╦═══╝
╠════════════╦═══╣    │     ╠════════════╦═══╣     │       │                 │       │    
│            │ I │    │     │            │   │     │       │                 │       │    
│            │ n │    │     │   Canvas   │   │     │       │     Canvas      │   I   │    
│            │ s │  ╔═╩═╗   │            │   │   ╔═╩═╗     │                 │   n   │    
├────────────┤ p │  ║ + ║   ├────────────┤   │   ║ = ║     │                 │   s   │    
│            │ e │  ╚═╦═╝   │            │   │   ╚═╦═╝     ├─────────────────┤   p   │    
│    Chat    │ c │    │     │            │   │     │       │                 │   e   │    
│            │ t │    │     │            │   │     │       │                 │   c   │    
└────────────┴───┘    │     └────────────┴───┘     │       │      Chat       │   t   │    
                      │                            │       │                 │       │    
                      │                            │       │                 │       │    
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
export const _blank = {
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
╠════════════╦╦════════════╦╦════════════╣     │            │    │
│            ││            │║            ║     │   Canvas   │    │
│    List    ││   Create   │║  Details   ║  ┌──│   Target   │    │
│            ││            │║            ║  │  │            │    │
└────────────┘└────────────┘╚════════════╝  │  ├────────────┤    │
                                   ▲        │  │            │    │
                                   │        │  │            │    │
                                   └────────┘  │            │    │
                                               │            │    │
                                               └────────────┴────┘
```
To define a canvas with component routing, you'll need to define the route components under `plugin.canvas` where `[key is TargetName]: Value is Component`. Than add a metadata object to the corresponding states like `meta: { ... breadcrumb('target', 'Title') }`. Example:
``` js
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

// in the plugin XState machine
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
┌───────────────────────────┐    ┌─────────────────────────┐    ┌───────────────────────────┐
│                           │    │                         │    │                           │
│         System A          │    │                         │    │                           │
│                           │    │                         │    │                           │
│ ┌─────────┐   ┌─────────┐ │    │                         │    │         System C          │
│ │ Sys. a1 │──▶│ Sys. a2 │ │    │        System B         │    │                           │
│ └─────────┘   └─────────┘ │───▶│                         │───▶│ ┌─────────┐   ┌─────────┐ │
│        ┌─────────┐ │      │    │                         │    │ │ Sys. c1 │──▶│ Sys. c2 │ │
│        │ Sys. a3 │◀┘      │    │                         │    │ └─────────┘   └─────────┘ │
│        └─────────┘        │    │                         │    │                           │
│                           │    │                         │    │                           │
└───────────────────────────┘    └─────────────────────────┘    └───────────────────────────┘
```
Systems are the building blocks of our agent. And that is agent singular. The current hype and language around multiple agents interacting is confusing and unneeded. Instead of multiple agents, we have multiple systems that make up one larger agent. Need more capabilities? Add more systems.

Systems can be started when the app starts up. Or a system can be spawned on the fly as needed. For example, we may have one system in the middle of a task, then a new tasks comes in while the other task is still going. We can spin up another parallel system to handle this new task, and orchestrate the two with some parent system.

In a similar vein, systems can have child systems, allowing developers to orchestrate and encapsulate complex functionality behind a unified interface. Functionality which can be used by other backend systems or sent to plugins on the front end.

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