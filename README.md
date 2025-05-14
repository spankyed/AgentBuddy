# Plugin-Actor system
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

Only the default plugin can define content to be shown in the chat area. The canvas and the inspection panel can be toggled to show custom content from the currently active plugin.

```
                      │                            │                                      
                      │                            │    ╔════════════════════════════════╗
╔════════════════╗    │     ╔════════════════╗     │    ║  What's currently being shown  ║
║ Default Plugin ║    │     ║ Active Plugin  ║     │    ╚══╦═════════════════╦═══════╦═══╝
╠════════════╦═══╣    │     ╠════════════╦═══╣     │       │                 │       │    
│            │ I │    │     │            │ I │     │       │                 │       │    
│   Canvas   │ n │    │     │   Canvas   │ n │     │       │     Canvas      │   I   │    
│            │ s │  ╔═╩═╗   │            │ s │   ╔═╩═╗     │                 │   n   │    
├────────────┤ p │  ║ + ║   └────────────┤ p │   ║ = ║     │                 │   s   │    
│            │ e │  ╚═╦═╝                │ e │   ╚═╦═╝     ├─────────────────┤   p   │    
│    Chat    │ c │    │                  │ c │     │       │                 │   e   │    
│            │ t │    │                  │ t │     │       │                 │   c   │    
└────────────┴───┘    │                  └───┘     │       │      Chat       │   t   │    
                      │                            │       │                 │       │    
                      │                            │       │                 │       │    
                      │                            │       └─────────────────┴───────┘    
                      │                            │                                      
```


# Systems

Todo


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