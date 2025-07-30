import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
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
    .pick(['id', 'topic', 'status', 'updatedAt', 'createdAt', 'shortCode', 'threadType'] as const)
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
    priority: thread.threadType === 'work-item' ? 1 : thread.threadType === 'project' ? 2 : 3,
    tags: [thread.threadType],
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
  
  const tab = createTabFromThread(
    { 
      id: dashboardThread.id,
      topic: String(dashboardThread.topic || 'Dashboard'),
      shortCode: ''
    },
    [kanbanArtifact, slackArtifact],
    'dashboard'
  );
  
  return { tab, threadId: dashboardThread.id };
}