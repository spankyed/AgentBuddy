# Track Layout System

How the flow canvas positions nodes using ELK's layered layout algorithm.

## Vocabulary

| Term | Definition |
|------|-----------|
| **Listener** | An entry-point node that waits for an event. Has no input port. Has one or more **exits** on its right side. Every track begins with exactly one listener. |
| **Step** | Any non-listener node (action, transform, query, switch, fire, etc.) that does work. Steps have an input port on the left and (usually) an output port on the right. |
| **Track** | A listener followed by a chain of steps connected by edges. A track is a self-contained horizontal sequence: `Listener → Step → Step → …` |
| **Exit** | A named output handle on a listener (e.g. exit-0, exit-1, exit-2). Each exit can connect to a different downstream step, creating branching paths from a single listener. |
| **Edge** | A directed connection from one node's output handle to another node's input handle. Edges carry a `sourceHandle` identifier (e.g. `exit-0`, `branch-1`) when the source has multiple outputs. |
| **Port** | The ELK-side representation of a handle. Each edge references a source port and a target port by ID. If a port ID on an edge doesn't match any declared port on the node, ELK silently drops that edge. |
| **Component** | A connected subgraph. Nodes that share no edges with each other belong to different components. Each track (after removing cross-listener edges) forms its own component. |
| **Switch** | A branching node with multiple output handles (branch-0, branch-1, …), one per condition. Similar to a listener's exits but for conditional routing mid-track. |
| **Fire** | A terminal node with an input but no output. Ends a track. |

## Visual structure

```
 ┌──────────────┐       ┌──────┐       ┌──────┐
 │  Listener A  │──────▶│ Step │──────▶│ Step │
 └──────────────┘       └──────┘       └──────┘

 ┌──────────────┐       ┌──────┐
 │  Listener B  │─exit0▶│ Step │
 │              │       └──────┘
 │   exit0      │
 │   exit1      │       ┌──────┐
 │   exit2      │─exit2▶│ Step │
 └──────────────┘       └──────┘
```

- **Tracks stack vertically** (top to bottom), separated by a gap.
- **Steps within a track flow horizontally** (left to right).
- A listener with multiple exits may fan out to different steps, but all belong to the same track.

## Key files

`packages/renderer/src/plugins/flows/canvas/nodes/node-dimensions.ts`

- Defines `NODE_DIMENSIONS` constants (shared between Vue components and layout engine) and a `NodeLayoutDescriptor` interface with `getHeight`, `getPorts`, and `hasInput`.
- Per-type descriptors: `defaultDescriptor`, `switchDescriptor`, `listenerDescriptor`, `fireDescriptor`. Accessed via `getDescriptor(nodeType)`.

`packages/renderer/src/plugins/flows/canvas/layout-utils.ts`

- **`buildElkGraph`** — translates app nodes/edges into an ELK graph. Delegates height and port logic to descriptors via `getDescriptor()`.
- **`calculateLayoutAsync`** — orchestrates the full layout pipeline and returns final positions.
- **`parseHandleIndex`** / **`buildPortId`** — helpers for handle string parsing and port ID construction.

## Layout pipeline (`calculateLayoutAsync`)

1. **Pre-compute listener exit counts** from all edges (before any filtering). For each listener, find the highest exit index referenced by its outgoing edges. This must use the full edge set so that port declarations reflect the listener's true exit count.
2. **Filter edges** — remove edges that target listener nodes (listeners have no input port; these are phantom inter-track references).
3. **Detect connected components** via BFS on filtered edges. Each component is typically one track.
4. **Build ELK graph per component** via `buildElkGraph`, passing in the pre-computed exit counts.
5. **Layout each component** independently with ELK.
6. **Stack components vertically** — each component is offset below the previous one, separated by `chainGap`.
7. **Return** the final position map.

If ELK throws, the fallback places nodes in a horizontal row: `{ x: i * 200, y: 0 }`.

## Port ID contract

For the layout to work, **every edge's source/target port ID must exactly match a port declared on its node**. Any mismatch causes ELK to silently drop the edge, which cascades into broken layouts.

Port naming conventions:

| Port type | ID format |
|-----------|-----------|
| Standard input | `{nodeId}-in` |
| Standard output | `{nodeId}-out` |
| Listener exit | `{nodeId}-out-exit-{N}` |
| Switch branch | `{nodeId}-out-branch-{N}` |
| Listener fallback output | `{nodeId}-out` |
| Listener input | *(none — listeners are entry points)* |
| Fire output | *(none — fire nodes are terminal)* |

An edge with `sourceHandle: "exit-0"` gets mapped to port `{nodeId}-out-exit-0`. If the node only declares port `{nodeId}-out` (the generic fallback), there's a mismatch and ELK drops the edge.

When a listener node has no connected exit edges (`exitCount` undefined), it gets a single default `{nodeId}-out` port — same as a regular node's output. This ensures edges referencing the generic output still resolve rather than causing an ELK port mismatch.

## Node height calculation

Node heights must match what the Vue components actually render. Mismatches cause tracks to overlap visually even when ELK positions are correct. Heights are defined via `NODE_DIMENSIONS` constants in `node-dimensions.ts` and computed by each descriptor's `getHeight` method.

| Node type | Height formula | Source |
|-----------|---------------|--------|
| Default | `nodeHeight` (50px) | `NODE_DIMENSIONS.default` |
| Switch | `max(50, 43 + branchCount × 26 + 10)` | `switchDescriptor` / `SwitchNode.vue` |
| Listener (with exits) | `max(50, headerOffset + visualExitCount × 22 + 10)` | `listenerDescriptor` / `ListenerNode.vue` |
| Listener (no exits) | `nodeHeight` (50px) | `listenerDescriptor` fallback |

For listeners:
- `headerOffset` = 43 + (29 if the node has an `eventType`, else 0)
- `visualExitCount` = connected exit count + 1, because `ListenerNode.vue` always renders one extra exit slot beyond the last connected exit (`maxIndex + 2` in the Vue component)
- When `exitCount` is undefined (no connected exit edges), the listener falls back to default height (50px)

## ELK configuration

Key layout options set on the root graph:

| Option | Value | Purpose |
|--------|-------|---------|
| `elk.algorithm` | `layered` | Layer-based left-to-right layout |
| `elk.direction` | `RIGHT` (or `DOWN`) | Flow direction |
| `elk.separateConnectedComponents` | `false` | Components are laid out manually, not by ELK's packer |
| `elk.portConstraints` | `FIXED_ORDER` | Ports stay in declared order |
| `elk.layered.nodePlacement.strategy` | `LINEAR_SEGMENTS` | Keeps chains straight |
| `elk.edgeRouting` | `SPLINES` | Curved edge routing |
