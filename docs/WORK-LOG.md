# DSL Switch Node Refactoring — Work Log

## Staged Changes (not yet committed)

All changes are staged on `master`. 7 files changed (+639 / -477 lines).

---

### 1. `dsl/types.ts` — Inline branch types for switch conditions

Added discriminated union types so switch conditions can either reference an existing node by label (`then`) or carry inline steps (`steps`):

- `DSLSwitchConditionRef` — `{ if, then }` (label reference)
- `DSLSwitchConditionInline` — `{ if, steps }` (inline branch)
- `DSLSwitchCondition` — union of the two
- `DSLSwitchElse` — `string | { steps: DSLStepNode[] }`
- Updated `DSLSwitchNode` to use the new types

### 2. `dsl/compiler.ts` — Unified compile pipeline & inline branch compilation

- Added shared types: `StepResult` (normalized `{ entity, relations }`) and `FlowCompileCtx` (bundled context threaded through functions)
- Normalized all step compilers (`compileActionNode`, `compileLLMNode`, `compileSwitchNode`, `compileFireNode`, `compileTransformNode`, `compileQueryNode`) to return `StepResult`
- `compileSwitchNode` now handles inline `steps` branches: recursively compiles nested steps, generates `sourceHandle: "branch-N"` edges, and derives branch labels from the first inline step when `then` is absent
- Introduced `compileStepList` — unified function for compiling a list of steps with sequential edge wiring, used by both top-level tracks and inline switch branches
- Pre-built edge maps for resolving `then` label references to node IDs

### 3. `dsl/export-to-dsl.ts` — Inline branch decompilation (round-trip)

- Added `DecompileGraphCtx` with pre-built `incomingEdges`/`outgoingEdges` maps for efficient graph traversal
- Added `isExclusiveChain` — detects if a chain of nodes starting from a switch branch target is exclusively reachable from that branch (single incoming edge from expected predecessor)
- Added `decompileChain` — converts an exclusive chain back into inline `steps`
- Added `operatorToDsl` map to convert `BinaryOperator` enum values back to DSL symbols (`equals` → `==`, etc.)
- Switch decompilation now emits inline `steps` for exclusive chains and `then` label references otherwise

### 4. `dsl/validator.ts` — Validate inline switch branches

- `validateSwitchStep` now handles the `then`/`steps` mutual exclusivity rule
- Recursively validates inline `steps` arrays within switch conditions
- Extracted `collectStepLabels` to handle label uniqueness checking across inline branches
- Validates `else` as either a string label or `{ steps: [...] }` object
- Passes `options` through to recursive `validateStep` calls

### 5. `dsl/examples/` — Deleted stale example files

- Deleted `chat-handler.json` and `exported-flows copy.json` (outdated examples that no longer match the current schema)

### 6. `tests/mocks/flows/chat-flow.ts` — Fixed stale switch node mock data

Done in this conversation session (audit cleanup):

- **Conditions**: replaced `{ expr: "type === 'question'" }` (non-existent field, silently ignored) with `{ predicate: { key: '$.type', operator: 'equals', value: 'question' } }` matching the `Condition` type
- **Switch edges**: replaced `{ condition: "Question" }` with `{ sourceHandle: "branch-0" }` matching the format `nextNodeForBranch` expects

---

## Audit Results (this session)

A codebase-wide audit confirmed all production consumers are correct:

- Brain switch handler, routing, and repository — all use `predicate`/`sourceHandle`
- Flows repository — stores/retrieves `sourceHandle` in edge `info`
- FE `SwitchNode.vue` and `SwitchForm.vue` — use `c.predicate` and `branch-N` handles
- FE `layout-utils.ts` — parses `sourceHandle` for branch index
- DSL compiler, exporter, validator — all consistent

The only stale code was the test mock (item 6 above), which was fixed.

## Verification

Both type checks pass:
- `npm run typecheck:be` — passed
- `npm run typecheck:fe` — passed
