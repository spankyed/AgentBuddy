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
    query: `return query('Settings').ids().forEach(id => write(id).destroy());`
  },


  // Updates
  {
    title: 'Update Entity Attributes',
    description: 'Update existing entity attributes',
    query: `// Find an entity to update
const threads = query(EARS.Entity.Thread).limit(1).ids();
if (threads.length === 0) {
  return { error: 'No threads found to update' };
}

const threadId = threads[0];
const before = query.ids(threadId).pickOne(['status', 'updatedAt']);

// Update the thread
// Every attribute write stamps updatedAt
write(threadId)
  .set('status', 'resolved')
  .set('resolvedBy', 'admin');

const after = query.ids(threadId).pickOne(['status', 'updatedAt', 'resolvedBy']);

return { threadId, before, after };`
  },

  // Roles
  {
    title: 'Move a Role',
    description: 'Grant a role to one entity, taking it from the others (roles are declared in apack.json)',
    query: `// The root flow is the flow holding the root_flow role; a role a pack didn't declare is refused
const current = query.all().withRole(EARS.RoleKind.ROOT_FLOW).first();
const next = query(EARS.Entity.Flow).ids().find((id) => id !== current);
if (!next) return { current, moved: false };

write(next).grantExclusive(EARS.RoleKind.ROOT_FLOW, query.all().withRole(EARS.RoleKind.ROOT_FLOW).ids());

return { previous: current, current: next, roles: getRoles(next) };`
  },

  // Complex Operations
  {
    title: 'Create Entity with Relations',
    description: 'Create an entity with attributes, roles, and relations',
    query: `// Create the nodes
const startId = create(EARS.Entity.Node)
  .setMany({ type: 'start', label: 'Begin Onboarding' })
  .id();
const actionId = create(EARS.Entity.Node)
  .setMany({ type: 'action', label: 'Collect Information' })
  .id();

// Create a flow holding them
const flowId = create(EARS.Entity.Flow)
  .setMany({
    name: 'Customer Onboarding',
    description: 'Automated customer onboarding flow',
    status: 'draft',
    version: '1.0.0'
  })
  .link(EARS.RelKind.CONTAINS, startId)
  .link(EARS.RelKind.CONTAINS, actionId)
  .id();

return query.ids(flowId).pickAll();`
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

// Update several fields; { touch: false } writes without stamping updatedAt
write(note.id).setMany({ noteType: 'document' });
write(note.id, { touch: false }).set('lastSeen', Date.now());

// Link it to a thread
const threadId = query(EARS.Entity.Thread).first();
if (threadId) write(note.id).link(EARS.RelKind.SPAWNED, threadId);

return query.ids(note.id).pickAll();`
  },

  // Safe Operations
  {
    title: 'Safe Link Creation',
    description: 'Create relations with cycle prevention',
    query: `// Create a hierarchy
const root = create(EARS.Entity.Thread)
  .set('title', 'Root Thread')
  .id();

const child = create(EARS.Entity.Thread)
  .set('title', 'Child Thread')
  .id();

const grandchild = create(EARS.Entity.Thread)
  .set('title', 'Grandchild Thread')
  .id();

// Link, refusing any link that would form a parent_of cycle
const acyclicIn = [EARS.RelKind.PARENT_OF];
write(root).link(EARS.RelKind.PARENT_OF, child, { acyclicIn });
write(child).link(EARS.RelKind.PARENT_OF, grandchild, { acyclicIn });

// This would fail due to cycle prevention
try {
  write(grandchild).link(EARS.RelKind.PARENT_OF, root, { acyclicIn });
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
