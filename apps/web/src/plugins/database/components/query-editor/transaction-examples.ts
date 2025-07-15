export interface TransactionExample {
  title: string;
  description: string;
  query: string;
}

export const transactionExamples: TransactionExample[] = [
  // Basic Creation
  {
    title: 'Create Agent',
    description: 'Create a new agent entity with attributes',
    query: `const agentId = tx(EARS.Entity.Agent)
  .put('name', 'Assistant Alpha')
  .put('description', 'Primary AI assistant')
  .put('status', 'active')
  .put('model', 'gpt-4')
  .grant('primary')
  .id();

return { created: agentId };`
  },
  {
    title: 'Create Thread with Message',
    description: 'Create a new thread and add an initial message',
    query: `// Create thread
const threadId = tx(EARS.Entity.Thread)
  .put('title', 'Customer Support')
  .put('status', 'open')
  .put('createdAt', Date.now())
  .id();

// Create initial message
const messageId = tx(EARS.Entity.Message)
  .put('text', 'Hello, how can I help you today?')
  .put('timestamp', Date.now())
  .put('sender', 'assistant')
  .link(EARS.RelKind.belongs_to, threadId)
  .id();

// Link message to thread
tx(threadId).link(EARS.RelKind.contains, messageId);

return { threadId, messageId };`
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
  {
    title: 'Batch Update Attributes',
    description: 'Update multiple attributes at once',
    query: `// Create an entity first
const entityId = tx(EARS.Entity.Agent)
  .put('name', 'Agent Smith')
  .id();

// Batch update attributes
tx(entityId).batchPut({
  status: 'active',
  lastActive: Date.now(),
  capabilities: ['chat', 'analysis', 'search'],
  config: {
    temperature: 0.7,
    maxTokens: 1000
  }
});

return qx(entityId).pickAll();`
  },

  // Relations
  {
    title: 'Create Relations',
    description: 'Link entities with various relation types',
    query: `// Create entities
const agentId = tx(EARS.Entity.Agent)
  .put('name', 'Multi-Agent')
  .id();

const threadId = tx(EARS.Entity.Thread)
  .put('title', 'Multi-Agent Thread')
  .id();

const tagId = tx(EARS.Entity.Tag)
  .put('name', 'important')
  .put('color', '#FF0000')
  .id();

// Create relations
tx(agentId).link(EARS.RelKind.contains, threadId);
tx(threadId).link(EARS.RelKind.has, tagId);

// Create symmetric relation
tx(agentId).link(EARS.RelKind.relates_to, threadId, { symmetric: true });

return {
  entities: { agentId, threadId, tagId },
  agentThreads: qx(agentId).linksTo('contains', EARS.Entity.Thread).ids(),
  threadTags: qx(threadId).linksTo('has', EARS.Entity.Tag).ids()
};`
  },
  {
    title: 'Replace Relations',
    description: 'Replace existing relations with linkOne',
    query: `// Create parent and child threads
const parentId = tx(EARS.Entity.Thread)
  .put('title', 'Parent Thread')
  .id();

const child1 = tx(EARS.Entity.Thread)
  .put('title', 'Child 1')
  .id();

const child2 = tx(EARS.Entity.Thread)
  .put('title', 'Child 2')
  .id();

// Link first child
tx(parentId).link(EARS.RelKind.parent_of, child1);

// Replace with second child (removes first relation)
tx(parentId).linkOne(EARS.RelKind.parent_of, child2);

return {
  parent: parentId,
  children: qx(parentId).linksTo('parent_of', EARS.Entity.Thread).pick(['id', 'title'])
};`
  },

  // Roles
  {
    title: 'Grant and Revoke Roles',
    description: 'Manage entity roles',
    query: `const agentId = tx(EARS.Entity.Agent)
  .put('name', 'Role Test Agent')
  .grant('assistant')
  .grant('analyzer')
  .id();

// Check initial roles
const initialRoles = getRoles(agentId);

// Revoke one role and grant another
tx(agentId)
  .revoke('assistant')
  .grant('supervisor');

// Ensure only this agent has the 'primary' role
tx(agentId).ensure('primary');

const finalRoles = getRoles(agentId);

return {
  agentId,
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

  // Deletion
  {
    title: 'Delete Entity',
    description: 'Remove an entity and its relations',
    query: `// Create a temporary entity
const tempId = tx(EARS.Entity.Tag)
  .put('name', 'temporary')
  .put('color', '#808080')
  .id();

// Verify it exists
const exists = qx(tempId).pickOne(['id', 'name']);

// Delete it
tx(tempId).destroy();

// Try to find it again
const afterDelete = qx(tempId).pickOne(['id']);

return {
  created: exists,
  afterDelete: afterDelete || 'Entity not found (successfully deleted)'
};`
  },

  // Repository Helpers
  {
    title: 'Use Repository Helpers',
    description: 'Create entities with auto-generated fields',
    query: `// Create entity with defaults (auto-generates shortCode, label, etc.)
const agent = createEntityWithDefaults(EARS.Entity.Agent, {
  name: 'Smart Assistant',
  description: 'AI-powered helper'
});

// Update with automatic timestamp
updateEntity(agent.id, {
  status: 'active',
  lastPing: Date.now()
});

// Create relation with helper
createRelation(agent.id, EARS.RelKind.spawned, 'Thread-1');

return qx(agent.id).pickAll();`
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