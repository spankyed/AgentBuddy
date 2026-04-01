# Fix: Tracks Render Horizontally Instead of Vertically

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

## Desired Layout

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

**Actual (broken) behavior**: All tracks appear in a single horizontal row, side by side, as if the layout engine is placing them with `{ x: i * 200, y: 0 }`.

## How ELK Layered Layout Works (relevant subset)

ELK's **layered algorithm** positions nodes in vertical layers (columns when direction = LEFT-TO-RIGHT). Key concepts:

1. **Ports**: Each node declares named ports on its sides (WEST = input, EAST = output). Edges connect a source port to a target port by ID.
2. **Port matching is strict**: If an edge references a port ID that doesn't exist on a node, ELK silently drops the edge. The nodes become disconnected from ELK's perspective.
3. **Connected components**: ELK detects independent subgraphs. With `separateConnectedComponents = true`, it lays each one out independently and then packs them together (default: left-to-right box packing — i.e. **horizontally**).
4. **Component packing direction**: By default, ELK packs disconnected components side-by-side horizontally. To get vertical stacking, you must either: (a) configure `elk.layered.compaction.connectedComponents.strategy` to pack downward, or (b) layout each component separately and stack the results yourself.
5. **Error handling**: If ELK encounters internal inconsistencies (orphan ports, mismatched IDs), it may throw. The current code catches errors and falls back to a horizontal row: `{ x: i * 200, y: 0 }`.

### Port ID contract

For the layout to work, **every edge's source/target port ID must exactly match a port declared on its node**. The naming conventions are:

- Standard output: `{nodeId}-out`
- Listen exit: `{nodeId}-out-exit-{N}`
- Switch branch: `{nodeId}-out-branch-{N}`
- Standard input: `{nodeId}-in`
- Listen nodes: **no input port** (they are entry points)

An edge with `sourceHandle: "exit-0"` gets mapped to port `{nodeId}-out-exit-0`. If the node only declares port `{nodeId}-out` (the generic fallback), there's a mismatch and ELK drops the edge.

## The Problem (no assumptions about root cause)

Tracks are rendering in a horizontal row instead of stacking vertically. This is somewhat of an edge case — it now occurs frequently with listeners that have **multiple exit handles**, but it also occurred less frequently before with single-exit listeners (so multi-exit nodes are not the only trigger, just the most reliable one).

**Working layout (single-exit listeners):** Tracks mostly stack vertically as expected, though occasional horizontal placement still happens.

**Broken layout (multi-exit listeners):** Tracks consistently collapse into a single horizontal row.

This suggests either:

1. ELK is throwing an error (triggering the fallback horizontal layout), or
2. ELK's component packing is placing independent tracks side-by-side, or
3. Some combination — partial failures within components cause unexpected behavior.

The correlation with multi-exit listeners strongly hints at a port ID mismatch: when a listener has indexed exit handles (`exit-0`, `exit-1`, …), the port IDs declared on the ELK node may not match the port IDs referenced by the edges, causing ELK to silently drop those edges (or throw).

The layout code lives in one file: `packages/renderer/src/plugins/flows/canvas/layout-utils.ts`. The two key functions are `buildElkGraph` (translates app nodes/edges into an ELK graph with ports) and `calculateLayoutAsync` (orchestrates the layout call).

## Algorithm: What the Layout Should Do

### High-level flow

1. **Receive** all nodes and edges from the flow.
2. **Classify** edges: identify edges that target listener nodes (these are "phantom" inter-track references and should be excluded from layout, since listeners have no input port).
3. **Compute global metadata**: Before any filtering or partitioning, gather any metadata that needs the full edge set (e.g. how many exits each listener has).
4. **Filter** edges: remove phantom edges (those targeting listeners).
5. **Detect components**: With the filtered edges, find connected components. Each component is typically one track.
6. **Build ELK graph per component**: For each component, construct an ELK-compatible graph where:
   - Every node declares the correct ports matching its type and actual connections
   - Every edge references port IDs that exactly match declared ports
   - Node dimensions reflect the visual size (multi-exit listeners and switches are taller)
7. **Layout each component**: Run ELK on each component independently.
8. **Stack components vertically**: Place each component's results below the previous one, separated by a gap.
9. **Return** the final position map.

### Critical invariant

**Port consistency**: When building the ELK graph, the port IDs declared on a node and the port IDs referenced by its edges must match exactly. Any mismatch causes silent edge drops, which cascades into broken layouts.

This means the logic that decides "should this listener get generic ports or indexed exit ports" must use information that reflects the listener's **true** exit count — not a count derived from a filtered or partitioned subset of edges.

## Relevant File

`packages/renderer/src/plugins/flows/canvas/layout-utils.ts`

## Verification

1. `npm run typecheck:fe` — no type errors
2. Visual: open a flow with 2+ tracks → tracks stack vertically
3. Visual: listener with 1 exit → edge renders, no regression
4. Visual: listener with multiple exits → all edges render
5. Visual: switch nodes → branches render correctly

## Instructions

You are a senior software engineer specializing in graph layout algorithms and reactive UI systems. Your task is to diagnose the root cause of the horizontal layout bug described above and implement a fix in `layout-utils.ts`.

**Approach:**
- Read the layout code carefully before changing anything. Trace the data flow from app nodes/edges through to ELK input and back.
- If needed, notify the user that you want to add temporary `console.log` statements to inspect the ELK graph being constructed — check whether ports match, edges survive, and components are detected correctly.
- Fix the root cause, not the symptom. Do not patch around the fallback; make ELK produce the correct layout.
- Keep changes minimal and focused. Do not refactor unrelated code.
- Run `npm run typecheck:fe` after your changes to catch type errors.
- Verify all five checks in the Verification section above.
