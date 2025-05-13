# Plugin-Actor system
```
                           ┌─────────┐          ┌─────────┐                          
                           │         │          │         │                          
                           │         │          │         │                          
                           │         │          │         │                          
┌─────────────┐     ┌───── │         │          │         │ ────┐     ┌─────────────┐
│    Brain    │◀────┘      │         │          │         │     └────▶│    Brain    │
├─────────────┤            │         │          │         │           ├─────────────┤
│    Agent    │ ───────▶   │         │ ◀─────── │         │  ◀─────── │    Agent    │
├─────────────┤            │         │┌────────┐│         │           ├─────────────┤
│   Threads   │ ───────▶   │   Web   ││  Full  ││ Backend │  ◀─────── │   Threads   │
├─────────────┤            │   Bus   ││ Duplex ││   Bus   │           ├─────────────┤
│   Prompts   │ ───────▶   │         │└────────┘│         │  ◀─────── │   Prompts   │
├─────────────┤            │         │ ───────▶ │         │           ├─────────────┤
│    Files    │ ───────▶   │         │          │         │  ◀─────── │    Files    │
├─────────────┤            │         │          │         │           ├─────────────┤
│    Code     │ ───────▶   │         │          │         │  ◀─────── │    Code     │
└─────────────┘            │         │          │         │           └─────────────┘
                           │         │          │         │                          
                           │         │          │         │                          
                           │         │          │         │                          
                           └─────────┘          └─────────┘                                     
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