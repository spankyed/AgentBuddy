# qx() Natural Language Examples

Simple examples for translating natural language to qx() query code.

### 1. Get all threads
```
prompt: "Get all threads"
code: const threads = qx(EARS.Entity.Thread).pickAll();
```

### 2. Find thread by ID
```
prompt: "Get thread T-123"
code: const thread = qx("T-123" as EARS.EntityId).pickOne();
```

### 3. Filter by status
```
prompt: "Find all open threads"
code: const openThreads = qx(EARS.Entity.Thread)
        .where("status", "open")
        .pickAll();
```

### 4. Get documents in collection
```
prompt: "Get all documents in collection C-5"
code: const docs = qx("C-5" as EARS.EntityId)
        .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
        .pickAll();
```

### 5. Count entities
```
prompt: "Count total number of flows"
code: const flowCount = qx(EARS.Entity.Flow).count();
```

### 6. Find by role
```
prompt: "Get the root flow"
code: const rootFlow = qx(EARS.Entity.Flow)
        .withRole("root_flow")
        .pickOne();
```

### 7. Sort by date
```
prompt: "Get threads sorted by most recent"
code: const threads = qx(EARS.Entity.Thread)
        .orderBy("lastMessageTimestamp", "desc")
        .pickAll();
```

### 8. Get specific fields
```
prompt: "Get names and statuses of all threads"
code: const threadInfo = qx(EARS.Entity.Thread)
        .pick(["topic", "status"]);
```

### 9. Follow relationships
```
prompt: "Get all nodes in flow F-1"
code: const nodes = qx("F-1" as EARS.EntityId)
        .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Node)
        .pick(["label", "nodeType", "position"]);
```

### 10. Check existence
```
prompt: "Does document DOC-15 exist?"
code: const exists = qx("DOC-15" as EARS.EntityId).first() !== null;
```