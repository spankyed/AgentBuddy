import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();
export const now = new Date(nowMs);

export const rows: Rows = {
  entity: [
    /*───────────────────────────────────────────────────────────────*
     * Thread entities                                               *
     *───────────────────────────────────────────────────────────────*/
    { 
      id: 'Thread-1', 
      entityType: EARS.Entity.Thread, 
      createdAt: nowMs - 9 * 61_000,
      topic: 'UI Layout Reorganization Instructions',
      timestamp: nowMs - 9 * 60_000,
      shortCode: 'U-182',
      threadType: 'work-item',
      status: 'active'
    },
    { 
      id: 'Thread-2', 
      entityType: EARS.Entity.Thread, 
      createdAt: nowMs - 61 * 60_000,
      topic: 'Adding Padding to Scrollbar in CSS',
      timestamp: nowMs - 61 * 60_000,
      shortCode: 'WI-45',
      threadType: 'work-item',
      status: 'queued'
    },
    { 
      id: 'Thread-3', 
      entityType: EARS.Entity.Thread, 
      createdAt: nowMs - 60 * 60_000,
      topic: 'Enhancing Chat Interface Design',
      timestamp: nowMs - 60 * 60_000,
      shortCode: 'U-67',
      threadType: 'work-item',
      status: 'draft'
    },
    { 
      id: 'Thread-4', 
      entityType: EARS.Entity.Thread, 
      createdAt: nowMs - 60 * 60_000,
      topic: 'Project X',
      timestamp: nowMs - 60 * 60_000,
      shortCode: 'P-13',
      threadType: 'project',
      status: 'inactive'
    },
    /*───────────────────────────────────────────────────────────────*
     * Tag entities                                                  *
     *───────────────────────────────────────────────────────────────*/
    {
      id: 'Tag-1',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'ui'
    },
    {
      id: 'Tag-2',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'design'
    },
    {
      id: 'Tag-3',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'frontend'
    },
    {
      id: 'Tag-4',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'css'
    },
    {
      id: 'Tag-5',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'chat'
    },
    {
      id: 'Tag-6',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'project'
    },
    {
      id: 'Tag-7',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'backend'
    },
    /*───────────────────────────────────────────────────────────────*
     * Message entities                                              *
     *───────────────────────────────────────────────────────────────*/
    { 
      id: 'Message-1', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 5 * 60_000,
      text: 'Can you help me understand how to use CSS variables in my design system?',
      sender: 'user',
      timestamp: nowMs - 5 * 60_000
    },
    { 
      id: 'Message-2', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 4 * 60_000,
      text: 'CSS variables (also known as custom properties) allow you to store specific values to reuse throughout a document. They follow this syntax: `--variable-name: value;`\n\nLet me show you an example in the canvas area above.',
      sender: 'assistant',
      timestamp: nowMs - 4 * 60_000
    },
    { 
      id: 'Message-3', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 3 * 60_000,
      text: 'That makes sense. Can you show me how to use them with a color palette?',
      sender: 'user',
      timestamp: nowMs - 3 * 60_000
    },
    { 
      id: 'Message-4', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 2 * 60_000,
      text: "Sure! I've updated the canvas with a color palette example using CSS variables. You can define your colors once in the :root selector and then reuse them throughout your CSS.",
      sender: 'assistant',
      timestamp: nowMs - 2 * 60_000
    },
    { 
      id: 'Message-5', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 1 * 60_000,
      text: 'please rewrite this code using css variables from our design systems',
      sender: 'user',
      timestamp: nowMs - 1 * 60_000
    },
    
    /*───────────────────────────────────────────────────────────────*
     * ContextItem item entities                                     *
     *───────────────────────────────────────────────────────────────*/
    { 
      id: 'ContextItem-1', 
      entityType: EARS.Entity.ContextItem, 
      createdAt: nowMs,
      title: 'Project Overview',
      content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
      itemType: 'text'
    },
    { 
      id: 'ContextItem-2', 
      entityType: EARS.Entity.ContextItem, 
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
      entityType: EARS.Entity.ContextItem, 
      createdAt: nowMs,
      title: 'Color Palette',
      content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
      itemType: 'text'
    },
    
    /*───────────────────────────────────────────────────────────────*
     * Canvas content                                                *
     *───────────────────────────────────────────────────────────────*/
    { 
      id: 'CanvasItem-1', 
      entityType: EARS.Entity.CanvasItem, 
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
  
  /*───────────────────────────────────────────────────────────────*
   * Role assignments                                              *
   *───────────────────────────────────────────────────────────────*/
  role: [
    {
      entityId: 'Thread-1',
      role: EARS.RoleKind.Custom('latest_thread'),
    },
    {
      entityId: 'Thread-1',
      role: EARS.RoleKind.Custom('selected_thread'),
    },
    {
      entityId: 'Message-1',
      role: EARS.RoleKind.Custom('latest_message'),
    },
  ],
  
  /*───────────────────────────────────────────────────────────────*
   * Relationships between entities                                *
   *───────────────────────────────────────────────────────────────*/
  relation: [
    /*───────────────────────────────────────────────────────────────*
     * Messages                                                      *
     *───────────────────────────────────────────────────────────────*/
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
    
    /*───────────────────────────────────────────────────────────────*
     * Context items                                                 *
     *───────────────────────────────────────────────────────────────*/
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'ContextItem-1',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'ContextItem-2',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'ContextItem-3',
      info: JSON.stringify({}),
    },
    
    /*───────────────────────────────────────────────────────────────*
     * Canvas content                                                *
     *───────────────────────────────────────────────────────────────*/
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'CanvasItem-1',
      info: JSON.stringify({}),
    },

    /*───────────────────────────────────────────────────────────────*
     * Thread-tag relationships                                      *
     *───────────────────────────────────────────────────────────────*/
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-1',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-2',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-1',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-3',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-2',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-4',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-2',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-3',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-3',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-1',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-3',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-5',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-3',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-2',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-4',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-6',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-4',
      kind: EARS.RelKind.HAS,
      tgtId: 'Tag-7',
      info: JSON.stringify({}),
    },

    /*───────────────────────────────────────────────────────────────*
     * Parent-child thread relationships                             *
     *───────────────────────────────────────────────────────────────*/
    {
      srcId: 'Thread-4',
      kind: EARS.RelKind.PARENT_OF,
      tgtId: 'Thread-3',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-4',
      kind: EARS.RelKind.PARENT_OF,
      tgtId: 'Thread-2',
      info: JSON.stringify({}),
    },
    {
      srcId: 'Thread-2',
      kind: EARS.RelKind.PARENT_OF,
      tgtId: 'Thread-1',
      info: JSON.stringify({}),
    },
  ],
};
