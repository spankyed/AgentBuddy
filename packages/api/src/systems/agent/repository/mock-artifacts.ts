import { tx } from '@/core/ears/helpers/transaction';
import { EARS } from '@/core/types';

// Slack artifact data that can be reused
export const slackArtifactData = {
  title: 'Slack Recap',
  content: {
    channels: [
      {
        name: '#general',
        unreadCount: 3,
        lastMessage: {
          author: '@john',
          text: 'Hey team, the new deployment went smoothly!',
          time: '2 hours ago'
        }
      },
      {
        name: '#dev-team',
        unreadCount: 7,
        lastMessage: {
          author: '@sarah',
          text: 'Can someone review my PR for the auth fix?',
          time: '45 minutes ago'
        }
      },
      {
        name: '#product-updates',
        unreadCount: 12,
        lastMessage: {
          author: '@productbot',
          text: 'New feature request: Dark mode support',
          time: '3 hours ago'
        }
      },
      {
        name: '#random',
        unreadCount: 25,
        lastMessage: {
          author: '@mike',
          text: 'Anyone up for lunch at the new Thai place?',
          time: '1 hour ago'
        }
      },
      {
        name: '#incidents',
        unreadCount: 0,
        lastMessage: {
          author: '@alertbot',
          text: 'All systems operational',
          time: '1 day ago'
        }
      }
    ]
  },
  artifactType: 'slack' as const,
};

// Dashboard artifacts mock data
const dashboardArtifactsData = [
  {
    id: 'Artifact-dashboard-1' as EARS.EntityId,
    title: 'Work Overview',
    content: {
      workItems: [
        {
          id: 1,
          name: 'Implement user authentication flow',
          time: '09:30',
          date: '2024-01-15',
          priority: 1,
          tags: ['backend', 'security'],
          status: 'in-progress',
          type: 'work-item',
        },
        {
          id: 2,
          name: 'Design new landing page',
          time: '14:45',
          date: '2024-01-14',
          priority: 2,
          tags: ['frontend', 'design'],
          status: 'backlog',
          type: 'work-item',
        },
        {
          id: 3,
          name: 'Fix database connection pooling',
          time: '11:20',
          date: '2024-01-15',
          priority: 1,
          tags: ['backend', 'bug'],
          status: 'in-review',
          type: 'work-item',
        },
        {
          id: 4,
          name: 'Write API documentation',
          time: '16:00',
          date: '2024-01-13',
          priority: 3,
          tags: ['documentation'],
          status: 'done',
          type: 'work-item',
        },
        {
          id: 5,
          name: 'Optimize image loading performance',
          time: '10:15',
          date: '2024-01-15',
          priority: 2,
          tags: ['frontend', 'performance'],
          status: 'open',
          type: 'work-item',
        }
      ]
    },
    artifactType: 'kanban' as const,
  },
  {
    id: 'Artifact-dashboard-2' as EARS.EntityId,
    ...slackArtifactData,
  }
];

// Load dashboard artifacts into EARS storage
export function loadDashboardArtifacts(): void {
  const timestamp = Date.now();
  
  dashboardArtifactsData.forEach(artifact => {
    const id = tx(artifact.id)
      .put('entityType', EARS.Entity.Artifact)
      .put('title', artifact.title)
      .put('content', artifact.content)
      .put('artifactType', artifact.artifactType)
      .put('createdAt', timestamp)
      .grant('dashboard_artifact')
      .id();
  });
}

// Mock thread with artifacts
const mockThreadArtifacts = [
  {
    id: 'Artifact-thread-code-1' as EARS.EntityId,
    title: 'Component Code',
    content: `// Example Component
import React from 'react';

export function ExampleComponent() {
  return (
    <div>
      <h1>Example Component</h1>
      <p>This is a mock code artifact for the example thread</p>
    </div>
  );
}`,
    artifactType: 'code' as const,
  },
  {
    id: 'Artifact-thread-text-1' as EARS.EntityId,
    title: 'Documentation',
    content: `# Example Documentation

This is documentation for the example feature. It includes:

- Overview of functionality
- Implementation details
- Usage examples
- Best practices`,
    artifactType: 'text' as const,
  }
];

// Load mock thread and its artifacts into EARS storage
export function loadMockThreadWithArtifacts(mockThreadId: EARS.EntityId): void {
  const timestamp = Date.now();
  
  // Create the mock thread
  const mId = tx(mockThreadId)
    .put('entityType', EARS.Entity.Thread)
    .put('topic', 'Example Thread with Artifacts')
    .put('instructions', 'This is a mock thread demonstrating artifacts')
    .put('timestamp', timestamp)
    .put('shortCode', 'T-1')
    .put('status', 'open')
    .put('createdAt', timestamp)
    .id();

  // Load thread artifacts
  mockThreadArtifacts.forEach(artifact => {
    tx(artifact.id)
      .put('entityType', EARS.Entity.Artifact)
      .put('title', artifact.title)
      .put('content', artifact.content)
      .put('artifactType', artifact.artifactType)
      .put('createdAt', timestamp)
      .link(EARS.RelKind.RELATES_TO, mockThreadId)
      .id();
  });
}

// Create dashboard tab and link artifacts
export function loadDashboardTab(): void {
  const timestamp = Date.now();
  
  // Create dashboard tab (using Thread entity with dashboard role)
  const dashboardTabId = 'Thread-dashboard' as EARS.EntityId;
  
  const tabId = tx(dashboardTabId)
    .put('topic', 'Dashboard')
    .put('createdAt', timestamp)
    .put('entityType', EARS.Entity.Thread)
    .grant('catchup_thread')
    .id();

  // Link dashboard artifacts to the dashboard tab
  dashboardArtifactsData.forEach(artifact => {
    tx(dashboardTabId).link(EARS.RelKind.HAS, artifact.id);
  });
}

// Export a function to initialize mock data after snapshot is loaded
export function initializeMockData(): void {
  console.log('=== Initializing mock artifacts data ===');
  loadDashboardArtifacts();
  loadDashboardTab();
  loadMockThreadWithArtifacts('Thread-mock-1' as EARS.EntityId);
}
