# AgentBuddy Video

Remotion-first demo video package.

## OOM Render Fix

If a Remotion render that previously worked starts failing with a Node heap OOM,
clear the local Remotion/webpack cache first:

```sh
rm -rf packages/video/node_modules/.cache
```

Then rerun the same render command, for example:

```sh
npm run video:render
npm run video:render:square
```

If the cache clear does not fix it, retry once with a larger Node heap:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npm run video:render
NODE_OPTIONS=--max-old-space-size=4096 npm run video:render:square
```

The more specific output and component demo notes live in
`src/film/OUTPUTS.md` and `src/agentbuddy-ui/COMPONENT_DEMOS.md`.
