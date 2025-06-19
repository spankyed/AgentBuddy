# Brain Runner System

The brain runner system orchestrates the execution of flows and nodes in the application. It has been refactored into a modular architecture for better maintainability and extensibility.

## Architecture Overview

```
brain/
├── runner.ts           # Main entry point
├── types.ts           # Shared type definitions
├── machines/          # XState state machines
│   ├── flow-machine.ts    # Flow execution machine
│   ├── step-machine.ts    # Step execution machine
│   └── spawners.ts        # Machine spawning utilities
├── nodes/             # Node type handlers
│   ├── node-executor.ts   # Central node execution dispatcher
│   ├── fire-node.ts       # Fire event node handler
│   ├── keep-alive-node.ts # Keep-alive node handler
│   └── llm-node.ts        # LLM node handler
└── utils/             # Utility functions
    ├── tnode-manager.ts   # TNode creation and management
    ├── flow-data.ts       # Flow and node data queries
    └── execution-chain.ts # Execution chain spawning
```

## Key Components

### Main Runner (`runner.ts`)
The entry point that:
- Initializes the root flow
- Creates the root TNode
- Starts the root flow machine
- Triggers the entry event

### State Machines (`machines/`)

#### Flow Machine
- Listens for events dynamically based on event nodes
- Handles child completion
- Spawns execution chains for event responders

#### Step Machine
- Creates TNodes for step execution
- Executes node-specific logic
- Reports completion to parent
- Handles error states

### Node Handlers (`nodes/`)
Each node type has its own handler:
- **Fire Node**: Emits events to specified scopes
- **Keep-Alive Node**: Maintains flow active state
- **LLM Node**: Handles LLM API calls

### Utilities (`utils/`)

#### TNode Manager
- Creates and persists TNodes
- Updates TNode status
- Emits TNode events

#### Flow Data
- Queries flow and node relationships
- Gets event nodes, responders, and transitions

#### Execution Chain
- Spawns appropriate machines (flow or step)
- Handles spawn errors

## Adding New Node Types

1. Create a new handler in `nodes/[node-name]-node.ts`:
```typescript
export function myNodeHandler(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  // Implementation
  actor.send({ type: 'COMPLETE', result: {...} });
}
```

2. Add the handler to `node-executor.ts`:
```typescript
case 'my_node':
  myNodeHandler(node, executionContext, actor);
  break;
```

3. Define any specific node interface in `types.ts` if needed

## Execution Flow

1. **Root Flow Start**: The runner creates a root flow machine
2. **Event Trigger**: Entry event is sent to the root flow
3. **Event Handling**: Flow machine finds matching event node
4. **Responder Chain**: Creates event TNode and spawns responder execution
5. **Step Execution**: Each step creates its TNode and executes
6. **Completion**: Steps notify parents, which spawn next steps
7. **Flow Persistence**: Flows with keep-alive nodes remain active

## TNode Hierarchy

TNodes form a trace tree:
- Root flow TNode (id: "TNode-1")
  - Event TNode (TRACKED relationship)
    - Step/Flow TNodes (SPAWNED relationships)
      - Nested TNodes...

## Future Enhancements

- Implement actual event scoping (local/global/parent)
- Add more node types (webhook, database, etc.)
- Implement error recovery strategies
- Add execution context persistence
- Support parallel execution branches 