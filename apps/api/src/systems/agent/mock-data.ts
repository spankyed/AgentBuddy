import { EARS } from '@/shared/ears/types';
import type { Rows, MessageEntity, ThreadEntity, ContextItemEntity, CanvasContentEntity } from '@/shared/types';

const nowMs = Date.now();
export const now = new Date(nowMs);

// Using the data from the original file but restructured to match the adapter/mock-data.ts format
export const rows: Rows = {
  entity: [
    // Thread entities
    { 
      id: 'Thread-1', 
      entityType: 'Thread', 
      createdAt: nowMs - 9 * 61_000,
      title: 'UI Layout Reorganization Instructions',
      timestamp: nowMs - 9 * 60_000,
      shortCode: 'U-182',
      tags: ['ui', 'design', 'frontend']
    },
    { 
      id: 'Thread-2', 
      entityType: 'Thread', 
      createdAt: nowMs - 61 * 60_000,
      title: 'Adding Padding to Scrollbar in CSS',
      timestamp: nowMs - 61 * 60_000,
      shortCode: 'WI-45',
      tags: ['css', 'frontend']
    },
    { 
      id: 'Thread-3', 
      entityType: 'Thread', 
      createdAt: nowMs - 60 * 60_000,
      title: 'Enhancing Chat Interface Design',
      timestamp: nowMs - 60 * 60_000,
      shortCode: 'U-67',
      tags: ['ui', 'chat', 'design']
    },
    { 
      id: 'Thread-4', 
      entityType: 'Thread', 
      createdAt: nowMs - 60 * 60_000,
      title: 'Project X',
      timestamp: nowMs - 60 * 60_000,
      shortCode: 'P-13',
      tags: ['project', 'backend']
    },
    // Message entities
    { 
      id: 'Message-1', 
      entityType: 'Message', 
      createdAt: nowMs - 5 * 60_000,
      content: 'Can you help me understand how to use CSS variables in my design system?',
      sender: 'user',
      timestamp: nowMs - 5 * 60_000
    },
    { 
      id: 'Message-2', 
      entityType: 'Message', 
      createdAt: nowMs - 4 * 60_000,
      content: 'CSS variables (also known as custom properties) allow you to store specific values to reuse throughout a document. They follow this syntax: `--variable-name: value;`\n\nLet me show you an example in the canvas area above.',
      sender: 'assistant',
      timestamp: nowMs - 4 * 60_000
    },
    { 
      id: 'Message-3', 
      entityType: 'Message', 
      createdAt: nowMs - 3 * 60_000,
      content: 'That makes sense. Can you show me how to use them with a color palette?',
      sender: 'user',
      timestamp: nowMs - 3 * 60_000
    },
    { 
      id: 'Message-4', 
      entityType: 'Message', 
      createdAt: nowMs - 2 * 60_000,
      content: "Sure! I've updated the canvas with a color palette example using CSS variables. You can define your colors once in the :root selector and then reuse them throughout your CSS.",
      sender: 'assistant',
      timestamp: nowMs - 2 * 60_000
    },
    { 
      id: 'Message-5', 
      entityType: 'Message', 
      createdAt: nowMs - 1 * 60_000,
      content: 'please rewrite this code using css variables from our design systems',
      sender: 'user',
      timestamp: nowMs - 1 * 60_000
    },
    
    // ContextItem item entities
    { 
      id: 'ContextItem-1', 
      entityType: 'ContextItem', 
      createdAt: nowMs,
      title: 'Project Overview',
      content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
      itemType: 'text'
    },
    { 
      id: 'ContextItem-2', 
      entityType: 'ContextItem', 
      createdAt: nowMs,
      title: 'CSS Variables Example',
      content: `
:root {
  --primary-color: #3B4D6C;
  --accent-color: #38B2AC;
  --text-color: #333;
  --background-color: #f9f9f9;
}

.button {
  background-color: var(--primary-color);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
}

.button.accent {
  background-color: var(--accent-color);
}
    `,
      itemType: 'code'
    },
    { 
      id: 'ContextItem-3', 
      entityType: 'ContextItem', 
      createdAt: nowMs,
      title: 'Color Palette',
      content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
      itemType: 'text'
    },
    
    // Canvas content
    { 
      id: 'Canvas-1', 
      entityType: 'CanvasContent', 
      createdAt: nowMs,
      contentType: 'code',
      content: `/* Before: Using hardcoded colors */
.header {
  background-color: #333;
  color: white;
}

.sidebar {
  background-color: #444;
  border-right: 1px solid #555;
}

.button {
  background-color: #0066cc;
  color: white;
}

.button.secondary {
  background-color: #6c757d;
}

/* Please rewrite this code using css variables from our design systems */`
    }
  ],
  
  // Role assignments
  role: [
    {
      entityId: 'Thread-1',
      role: EARS.RoleKind.Custom('latest_thread'),
    },
    {
      entityId: 'Message-1',
      role: EARS.RoleKind.Custom('latest_message'),
    },
  ],
  
  // Relationships between entities
  relation: [
    // messages
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      tgtId: 'Message-1',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      tgtId: 'Message-2',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      tgtId: 'Message-3',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      tgtId: 'Message-4',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      tgtId: 'Message-5',
      info: JSON.stringify({}),
    },
    
    // context items
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.OWNS,
      tgtId: 'ContextItem-1',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.OWNS,
      tgtId: 'ContextItem-2',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.OWNS,
      tgtId: 'ContextItem-3',
      info: JSON.stringify({}),
    },
    
    // canvas content
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.OWNS,
      tgtId: 'Canvas-1',
      info: JSON.stringify({}),
    },
  ],
};
