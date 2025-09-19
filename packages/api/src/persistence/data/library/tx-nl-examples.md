# tx() Natural Language Examples

Simple examples for translating natural language to tx() code.

### 1. Create a new thread
```
prompt: "Create a new thread about user authentication"
code: const id = tx(EARS.Entity.Thread)
        .put("topic", "user authentication")
        .put("status", "open")
        .put("timestamp", Date.now())
        .id();
```

### 2. Update multiple fields
```
prompt: "Mark thread T-123 as resolved with a note"
code: tx("T-123" as EARS.EntityId)
        .update("status", "resolved")
        .update("note", "Fixed in v2.1")
        .update("updatedAt", Date.now());
```

### 3. Create and link entities
```
prompt: "Create document 'API Guide' in collection C-5"
code: const docId = tx(EARS.Entity.Document)
        .put("name", "API Guide")
        .id();
      tx("C-5" as EARS.EntityId).link(EARS.RelKind.CONTAINS, docId);
```

### 4. Update single field
```
prompt: "Change thread T-45 status to in-progress"
code: tx("T-45" as EARS.EntityId).update("status", "in-progress");
```

### 5. Delete entity
```
prompt: "Delete document DOC-23"
code: tx("DOC-23" as EARS.EntityId).destroy();
```

### 6. Link entities
```
prompt: "Link thread T-12 as parent of thread T-34"
code: tx("T-12" as EARS.EntityId).link(EARS.RelKind.Custom("parent_of"), "T-34" as EARS.EntityId);
```

### 7. Set unique role
```
prompt: "Make flow F-1 the root flow"
code: tx("F-1" as EARS.EntityId).ensure("root_flow");
```

### 8. Remove relationships
```
prompt: "Remove all parent links from thread T-22"
code: tx("T-22" as EARS.EntityId).unlinkIf(EARS.RelKind.Custom("parent_of"));
```

### 9. Add multiple tags
```
prompt: "Add tags 'bug' and 'urgent' to thread T-99"
code: tx("T-99" as EARS.EntityId)
        .add("tags", "bug")
        .add("tags", "urgent");
```

### 10. Create flow with nodes
```
prompt: "Create flow 'Onboarding' with entry and exit nodes"
code: const flowId = tx(EARS.Entity.Flow)
        .put("label", "Onboarding")
        .put("status", "draft")
        .id();

      const entryId = tx(EARS.Entity.Node)
        .put("label", "Start")
        .put("nodeType", "entry")
        .id();

      const exitId = tx(EARS.Entity.Node)
        .put("label", "End")
        .put("nodeType", "exit")
        .id();

      tx(flowId).link(EARS.RelKind.CONTAINS, entryId);
      tx(flowId).link(EARS.RelKind.CONTAINS, exitId);
      tx(entryId).link(EARS.RelKind.TRANSITIONS_TO, exitId);
```
