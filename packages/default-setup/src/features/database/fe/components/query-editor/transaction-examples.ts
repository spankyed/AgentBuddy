export interface TransactionExample {
  title: string;
  description: string;
  query: string;
}

export const transactionExamples: TransactionExample[] = [
  // Basic Creation
  {
    title: 'Reset Settings',
    description: 'Reset all settings by destroying all entries in the Settings collection',
    query: `return qx('Settings').ids().forEach(id => tx(id).destroy());`
  },


  // Updates
  {
    title: 'Update Entity Attributes',
    description: 'Update existing entity attributes',
    query: `// Find an entity to update
const threads = qx(EARS.Entity.Thread).limit(1).ids();
if (threads.length === 0) {
  return { error: 'No threads found to update' };
}

const threadId = threads[0];
const before = qx(threadId).pickOne(['status', 'updatedAt']);

// Update the thread
tx(threadId)
  .put('status', 'resolved')
  .put('updatedAt', Date.now())
  .put('resolvedBy', 'admin');

const after = qx(threadId).pickOne(['status', 'updatedAt', 'resolvedBy']);

return { threadId, before, after };`
  },

  // Roles
  {
    title: 'Grant and Revoke Roles',
    description: 'Manage entity roles',
    query: `const noteId = tx(EARS.Entity.Note)
  .put('title', 'Role Test Note')
  .grant('assistant')
  .grant('analyzer')
  .id();

// Check initial roles
const initialRoles = getRoles(noteId);

// Revoke one role and grant another
tx(noteId)
  .revoke('assistant')
  .grant('supervisor');

// Ensure only this note has the 'primary' role
tx(noteId).ensure('primary');

const finalRoles = getRoles(noteId);

return {
  noteId,
  initialRoles,
  finalRoles
};`
  },

  // Complex Operations
  {
    title: 'Define Entity with Relations',
    description: 'Create entity with attributes, roles, and relations in one call',
    query: `// Create a flow with complete definition
const flowId = tx(EARS.Entity.Flow)
  .define({
    attributes: {
      name: 'Customer Onboarding',
      description: 'Automated customer onboarding flow',
      status: 'draft',
      version: '1.0.0'
    },
    roles: ['template', 'featured'],
    links: {
      // Create and link nodes
      contains: [
        tx(EARS.Entity.Node)
          .put('type', 'start')
          .put('label', 'Begin Onboarding')
          .id(),
        tx(EARS.Entity.Node)
          .put('type', 'action')
          .put('label', 'Collect Information')
          .id()
      ]
    }
  })
  .id();

return qx(flowId).pickAll();`
  },


  // Repository Helpers
  {
    title: 'Use Repository Helpers',
    description: 'Create entities with auto-generated fields',
    query: `// Create entity with defaults (auto-generates shortCode, label, etc.)
const note = createEntityWithDefaults(EARS.Entity.Note, {
  title: 'Smart Note',
  content: 'AI-powered helper'
});

// Update with automatic timestamp
updateEntity(note.id, {
  noteType: 'document',
  lastSeen: Date.now()
});

// Create relation with helper
createRelation(note.id, EARS.RelKind.spawned, 'Thread-1');

return qx(note.id).pickAll();`
  },

  // Safe Operations
  {
    title: 'Safe Link Creation',
    description: 'Create relations with cycle prevention',
    query: `// Create a hierarchy
const root = tx(EARS.Entity.Thread)
  .put('title', 'Root Thread')
  .id();

const child = tx(EARS.Entity.Thread)
  .put('title', 'Child Thread')
  .id();

const grandchild = tx(EARS.Entity.Thread)
  .put('title', 'Grandchild Thread')
  .id();

// Create safe hierarchy
tx(root).safeLink(EARS.RelKind.parent_of, child);
tx(child).safeLink(EARS.RelKind.parent_of, grandchild);

// This would fail due to cycle prevention
try {
  tx(grandchild).safeLink(EARS.RelKind.parent_of, root, {
    preventCycles: true,
    relationKind: EARS.RelKind.parent_of
  });
} catch (error) {
  return {
    hierarchy: {
      root,
      child,
      grandchild
    },
    cyclePreventionWorking: true,
    error: error.message
  };
}

return { error: 'Cycle prevention did not work as expected' };`
  }
];