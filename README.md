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

Plugins define what gets shown in a specific area of the app. There are two special types of plugins:
```
┌──────────────────────────────────────────────┐
│                                              │
│  ╔════════════════╗      ╔═══════════════╗   │
│  ║ Default Plugin ║      ║ Active Plugin ║   │
│  ╚════════════════╝      ╚═══════════════╝   │
│  ┌────────────┬───┐      ┌────────────┬───┐  │
│  │            │ I │      │            │ I │  │
│  │   Canvas   │ n │      │   Canvas   │ n │  │
│  │            │ s │      │            │ s │  │
│  ├────────────┤ p │      └────────────┤ p │  │
│  │            │ e │                   │ e │  │
│  │    Chat    │ c │                   │ c │  │
│  │            │ t │                   │ t │  │
│  └────────────┴───┘                   └───┘  │
│                                              │
└──────────────────────────────────────────────┘
```
The default plugin, and only it, can define content to be shown in the chat area. However, the canvas and the inspection panel can be toggled to show custom content from the active plugin.

```
      ╔════════════════════════════════════╗
      ║          Default + Active          ║
      ╚════════════════════════════════════╝
                                            
                       │  ┌────────────┬───┐
                       │  │            │ I │
                       │  │   Canvas   │ n │
                       │  │            │ s │
       ┌────────────┐  │  └────────────┤ p │
       │            │  │               │ e │
       │    Chat    │  │               │ c │
       │            │  │               │ t │
       └────────────┘  │               └───┘
                                            
                      ╔═══╗                 
      ────────────────╣ = ╠─────────────────
                      ╚═══╝                 
           ┌─────────────────┬───────┐      
           │                 │       │      
           │                 │       │      
           │     Canvas      │   I   │      
           │                 │   n   │      
           │                 │   s   │      
           ├─────────────────┤   p   │      
           │                 │   e   │      
           │                 │   c   │      
           │     Canvas      │   t   │      
           │                 │       │      
           │                 │       │      
           └─────────────────┴───────┘      
```



# root
pnpm install
pnpm be        # tsc --watch + nodemon
pnpm fe        # Vite + Tailwind

# tRPC TypeScript version requirement
```
TypeScript version >=5.7.2 is now required (non-breaking)
tRPC now requires TypeScript version 5.7.2 or higher. This change was made in response to a bug report where we decided to take a forward-looking approach.

If you try to install tRPC with an unsupported TypeScript version, you'll receive a peer dependency error during installation.

If you notice your editor showing any types, it's likely because your editor isn't using the correct TypeScript version. To fix this, you'll need to configure your editor to use the TypeScript version installed in your project's package.json.

For VSCode users, add these settings to your .vscode/settings.json:

.vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## License

Private project - All rights reserved