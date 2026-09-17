# Brain backend

How the brain runs flows. Files are relative to `features/brain/be/`.

## Layout

```
be/
├── system.ts               # The brain system: starts/stops the root flow, routes TRIGGER_BRAIN_EVENT, pause and inspect toggles
├── flow-system.ts          # createFlowNodeSystem(): one XState machine per running flow (root or subflow), and the flow actor registry
├── step-system.ts          # createStepNodeSystem(): one machine per step run, which calls executeNode and stores the result
├── flow-completion.ts      # When a flow completes (isPersistentTriggerFlow, shouldCompleteFlow)
├── trigger-dedupe.ts       # Keeps one trigger node per track key when a flow machine is created, warning about the rest
├── node-handlers/
│   ├── index.ts            # executeNode(): dispatches a step to its registered runtime handler
│   └── transform.ts        # Unused: exports nothing, and nothing imports it
├── repository/
│   ├── index.ts            # brainQueries/brainCommands: root flow and step TNodes, results (stored through the SDK's `tnodeRepository`, capped by `truncateResult` from `@abuddy/sdk/steps`)
│   └── node-attribute-mappers.ts  # Resolves a step's params from the event and earlier steps
├── services/
│   ├── brain.ts            # services.brain: ad-hoc event listeners (listen/unlisten); notify, removeAllListeners for the pack
│   └── scheduler.ts        # services.scheduler: cron jobs for schedule triggers
├── types.ts
└── utils/
    ├── brain-inspect.ts    # brainLogger; its debug messages follow the `brain` debug toggle the brain system sets
    └── brain-pause.ts      # The paused flag (setBrainPausedState, isBrainPaused)
```

`utils/prompt-context-example.md` is a separate note on prompts that call other prompts.

## How a flow runs

1. The brain system runs the flow with the root role (`repository.flowsQueries.rootFlow()`). With flows but no root flow it stays stopped and reports why.
2. `createFlowNodeSystem()` creates the flow's TNode and a machine that listens for the event types of the flow's trigger nodes. Running flow actors are kept by flow TNode id (`getFlowActor`, `clearFlowActorRegistry`, which the pack's `onShutdown` calls).
3. An event spawns a track: `createStepNodeSystem()` for each step, and a nested flow machine for a subflow. The brain sends `TNODE_SPAWNED` and `TNODE_UPDATED` to the brain plugin as TNodes start and change status.
4. A step machine calls `executeNode()`, which looks up `stepRegistry.get(node.nodeType).runtime.handler`. Trigger nodes and types without a handler complete with no work. An async handler's rejection is reported with `reportError` (with `step` context) and fails the step.
5. Step results and TNode attributes pass through `truncateResult` before they're stored (`updateTNodeResult`, `updateTNodeAttributes`).

## Adding a node type

Node types are steps, not brain code. Add one under `src/extensions/steps/<name>/` (`build.ts`, `index.ts` with a `runtime.handler`, `fe.ts`, `types.ts`) and register it in `src/extensions/steps/register.ts` and `build.ts`. See the "Flow steps" section of `packages/default-setup/CLAUDE.md`.
