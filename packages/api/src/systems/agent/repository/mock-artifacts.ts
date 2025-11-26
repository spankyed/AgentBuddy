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


// Export a function to initialize mock data after snapshot is loaded
export function initializeMockData(): void {
  console.log('=== Initializing mock artifacts data ===');
  loadMockThreadWithArtifacts('Thread-mock-1' as EARS.EntityId);
}
