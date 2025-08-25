import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import type { Tab, ArtifactItem } from '../types';
import { slackArtifactData } from './mock-artifacts';

// Helper function to get dashboard tab
export function getDashboardTab(
  createTabFromThread: (thread: any, artifacts: ArtifactItem[], tabId?: string) => Tab | null
): { tab: Tab | null; threadId: EARS.EntityId | null } {
  const dashboardThread = qx(EARS.Entity.Thread)
    .withRole('catchup_thread')
    .pick(['id', 'topic'] as const)[0];
  
  if (!dashboardThread) {
    return { tab: null, threadId: null };
  }
  
  // Get all threads and transform them into kanban work items
  const allThreads = qx(EARS.Entity.Thread)
    .pick(['id', 'topic', 'status', 'updatedAt', 'createdAt', 'shortCode'] as const)
    .filter(thread => thread.id !== dashboardThread.id); // Exclude dashboard thread itself
  
  // Sort threads by most recent update (fallback to createdAt)
  const sortedThreads = allThreads.sort((a, b) => {
    const aTime = (a.updatedAt as number) || (a.createdAt as number) || 0;
    const bTime = (b.updatedAt as number) || (b.createdAt as number) || 0;
    return bTime - aTime;
  });
  
  // Transform threads into work items
  const workItems = sortedThreads.map((thread, index) => ({
    id: thread.id,
    name: String(thread.topic || `Thread ${thread.shortCode || index + 1}`),
    time: new Date((thread.updatedAt as number) || (thread.createdAt as number) || Date.now()).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }),
    date: new Date((thread.updatedAt as number) || (thread.createdAt as number) || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }),
    priority: 1, // Default priority
    tags: [],
    status: thread.status || 'backlog',
    type: 'work-item' as const
  }));
  
  // Create kanban artifact
  const kanbanArtifact: ArtifactItem = {
    id: `${dashboardThread.id}-kanban`,
    type: 'kanban',
    title: 'Work Overview',
    content: {
      workItems
    },
    metadata: {
      createdAt: Date.now()
    }
  };
  
  // Create slack artifact using imported mock data
  const slackArtifact: ArtifactItem = {
    id: `${dashboardThread.id}-slack`,
    type: slackArtifactData.artifactType,
    title: slackArtifactData.title,
    content: slackArtifactData.content,
    metadata: {
      createdAt: Date.now()
    }
  };
  
  // Create todo artifact for testing
  const mockTodoArtifact: ArtifactItem = {
    id: `${dashboardThread.id}-todo`,
    type: 'todo',
    title: 'Proposed Tasks',
    content: {
      tasks: [
        { id: '1', description: 'Review and merge the pull request for auth fix', completed: false },
        { id: '2', description: 'Update documentation for new API endpoints', completed: false },
        { id: '3', description: 'Set up monitoring for production deployment', completed: false },
        { id: '4', description: 'Schedule team meeting to discuss Q2 roadmap', completed: false },
      ],
      status: 'pending'
    },
    metadata: {
      createdAt: Date.now()
    }
  };
  
  const tab = createTabFromThread(
    { 
      id: dashboardThread.id,
      topic: String(dashboardThread.topic || 'Dashboard'),
      shortCode: ''
    },
    [kanbanArtifact, slackArtifact, mockTodoArtifact],
    'dashboard'
  );
  
  return { tab, threadId: dashboardThread.id };
}