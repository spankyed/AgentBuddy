# tx() code
```
export interface SafeLinkOptions {
  /** Additional info to store with the relation */
  info?: unknown;
  /** If true, creates bidirectional edges automatically */
  symmetric?: boolean;
  /** If specified, prevents cycles within this group of relation kinds */
  acyclicGroup?: readonly EARS.RelKind[];
}

export function tx(typeOrId: EARS.Entity | EARS.EntityId, useProvidedId = false) {
  const isEntityType = Object.values(EARS.Entity).includes(typeOrId as EARS.Entity);

  // Generate new ID if entity type provided, otherwise use the provided ID
  const id: EARS.EntityId = isEntityType && !useProvidedId
    ? createEntity(typeOrId as EARS.Entity)
    : (typeOrId as EARS.EntityId);

  // Add timestamp for new entities (either from entity type or when explicitly marked as new)
  if (isEntityType || useProvidedId) {
    putAttr(id, EARS.AttrKind.Custom('createdAt'), Date.now());
  }

  const preventSelfLoop = (t: EARS.EntityId) => {
    if (t === id) throw new Error("tx.link(): source and target cannot be the same");
  };

  /*──────── core fluent surface ───────────*/
  const self = {
    /*─ attrs ─*/
    put: (k: EARS.AttrKind | string, v: unknown, allowMultiple = false) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      if (allowMultiple) {
        addAttr(id, kind, v);
      } else {
        putAttr(id, kind, v);
      }
      return self;
    },
    add: (k: EARS.AttrKind | string, v: unknown) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      addAttr(id, kind, v);
      return self;
    },
    batchPut: (attrs: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(attrs)) {
        putAttr(id, EARS.AttrKind.Custom(k), v);
      }
      return self;
    },
    merge: (k: EARS.AttrKind, v: unknown, i?: number) => (mergeAttr(id, k, v, i), self),
    drop: (k: EARS.AttrKind, i?: number) => (dropAttr(id, k, i), self),
    dropIf: (k: EARS.AttrKind, c: unknown) => (dropIf(id, k, c), self),
    update: (k: EARS.AttrKind | string, v: unknown) => {
      const kind = typeof k === "string" ? EARS.AttrKind.Custom(k) : k;
      updateAttr(id, kind, v);
      return self;
    },
    updateBatch: (attrs: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(attrs)) {
        updateAttr(id, EARS.AttrKind.Custom(k), v);
      }
      return self;
    },

    /*─ roles ─*/
    grant: (r: string) => {
      if (!getRoles(id).includes(r)) grantRole(id, r);
      return self;
    },
    revoke: (r: string) => {
      if (getRoles(id).includes(r)) revokeRole(id, r);
      return self;
    },
    ensure: (r: string, scope?: readonly EARS.EntityId[]) => {
      // Only query if scope not provided
      const entities = scope ?? qx().withRole(r).ids();
      entities.forEach(e => revokeRole(e, r));
      grantRole(id, r);
      return self;
    },

    /*─ relations (raw) ─*/
    link: (k: EARS.RelKind, t: EARS.EntityId, info?: unknown) => {
      preventSelfLoop(t); // ! this is being reached
      addRelation(id, k, t, info);
      return self;
    },
    relPatch: (
      rel: EARS.EntityId,
      u: { sourceEntity?: EARS.EntityId; targetEntity?: EARS.EntityId; info?: unknown },
    ) => {
      updateRelation(rel, u.sourceEntity, u.targetEntity, u.info);
      return self;
    },
    unlink: (rel: EARS.EntityId) => (removeRelation(rel), self),

    /*─ criteria‑edges (edge‑store) ─*/
    linkOne: (k: EARS.RelKind, t: EARS.EntityId, info?: unknown) => {
      preventSelfLoop(t);
      edgeStore.linkOne(id, k, t, info);
      return self;
    },
    safeLink: (k: EARS.RelKind, t: EARS.EntityId, options?: SafeLinkOptions) => {
      preventSelfLoop(t);
      
      const opts = options || {};
      
      // Check for cycles if configured
      if (opts.acyclicGroup && wouldCreateCycle(id, t, opts.acyclicGroup)) {
        // Generate meaningful error message based on context
        let errorMsg: string;
        if (opts.acyclicGroup.length === 1) {
          errorMsg = `Cannot create a ${k} relation that would form a cycle`;
        } else {
          const kinds = opts.acyclicGroup.join(', ');
          errorMsg = `Cannot create a ${k} relation that would form a cycle within [${kinds}]`;
        }
        throw new Error(errorMsg);
      }
      
      // Handle symmetric relations
      if (opts.symmetric) {
        linkSymmetric(id, t, k, opts.info);
        return self;
      }
      
      // Default behavior - regular linkOne
      return self.linkOne(k, t, opts.info);
    },
    patchLink: (
      k: EARS.RelKind,
      t: EARS.EntityId,
      u: { newTarget: EARS.EntityId; newInfo?: unknown },
    ) => {
      edgeStore.patchOne(
        { sourceEntity: id, relationType: k, targetEntity: t },
        { newTarget: u.newTarget, newInfo: u.newInfo },
      );
      return self;
    },
    unlinkIf: (k: EARS.RelKind, t?: EARS.EntityId) => (
      edgeStore.unlink({ sourceEntity: id, relationType: k, targetEntity: t }),
      self
    ),
    unlinkWhere: (c?: { kind?: EARS.RelKind; target?: EARS.EntityId }) => (
      edgeStore.unlink({
        sourceEntity: id,
        targetEntity: c?.target,
        relationType: c?.kind,
      }),
      self
    ),
    define: (def: {
      attributes?: Record<string, unknown>;
      links?: [EARS.RelKind, EARS.EntityId] | Array<[EARS.RelKind, EARS.EntityId]>;
      roles?: string | string[];
    }) => {
      if (def.attributes) {
        self.batchPut(def.attributes);
      }

      if (def.links) {
        const links = Array.isArray(def.links[0])
          ? def.links as Array<[EARS.RelKind, EARS.EntityId]>
          : [def.links] as Array<[EARS.RelKind, EARS.EntityId]>;

        for (const [kind, target] of links) {
          self.link(kind, target);
        }
      }

      if (def.roles) {
        const roles = Array.isArray(def.roles) ? def.roles : [def.roles];
        for (const role of roles) {
          self.grant(role);
        }
      }

      return self;
    },

    /*─ entity lifecycle ─*/
    destroy: (skipPersistence = false) => (destroyEntity(id, skipPersistence), undefined as never),

    /*─ misc ─*/
    id: () => id,
  } as const;

  return self;
};
```

# tx() Natural Language Examples

Simple examples for translating natural language to tx() code.

### 1. Create a new thread
```
prompt: "Create a new thread about user authentication"
code: return tx(EARS.Entity.Thread)
        .put("topic", "user authentication")
        .put("status", "open")
        .put("timestamp", Date.now())
        .id();
```

### 2. Update multiple fields
```
prompt: "Mark thread T-123 as resolved with a note"
code: return tx("T-123" as EARS.EntityId)
        .update("status", "resolved")
        .update("note", "Fixed in v2.1")
        .update("updatedAt", Date.now());
```

### 3. Create and link entities
```
prompt: "Create document 'API Guide' in collection C-5"
code: return (() => {
        const docId = tx(EARS.Entity.Document)
          .put("name", "API Guide")
          .id();
        tx("C-5" as EARS.EntityId).link(EARS.RelKind.CONTAINS, docId);
        return docId;
      })();
```

### 4. Update single field
```
prompt: "Change thread T-45 status to in-progress"
code: return tx("T-45" as EARS.EntityId).update("status", "in-progress");
```

### 5. Delete entity
```
prompt: "Delete document DOC-23"
code: return tx("DOC-23" as EARS.EntityId).destroy();
```

### 6. Link entities
```
prompt: "Link thread T-12 as parent of thread T-34"
code: return tx("T-12" as EARS.EntityId).link(EARS.RelKind.Custom("parent_of"), "T-34" as EARS.EntityId);
```

### 7. Set unique role
```
prompt: "Make flow F-1 the root flow"
code: return tx("F-1" as EARS.EntityId).ensure("root_flow");
```

### 8. Remove relationships
```
prompt: "Remove all parent links from thread T-22"
code: return tx("T-22" as EARS.EntityId).unlinkIf(EARS.RelKind.Custom("parent_of"));
```

### 9. Add multiple tags
```
prompt: "Add tags 'bug' and 'urgent' to thread T-99"
code: return tx("T-99" as EARS.EntityId)
        .add("tags", "bug")
        .add("tags", "urgent");
```

### 10. Create flow with nodes
```
prompt: "Create flow 'Onboarding' with entry and exit nodes"
code: return (() => {
        const flowId = tx(EARS.Entity.Flow)
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

        return { flowId, entryId, exitId };
      })();
```

### 11. Delete all entities of a type
```
prompt: "Delete all settings entities"
code: return qx(EARS.Entity.Settings).ids().forEach(id => tx(id).destroy());
```
