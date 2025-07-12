import { EARS } from '@/core/utils/ears/types';
import type { Rows } from '@/core/types';

const nowMs = Date.now();
export const now = new Date(nowMs);

export const threadRows: Rows = {
  entity: [
    /*───────────────────────────────────────────────────────────────*
     * Thread entities                                               *
     *───────────────────────────────────────────────────────────────*/
    { 
      id: 'Thread-1', 
      entityType: EARS.Entity.Thread, 
      createdAt: nowMs - 9 * 61_000,
      topic: 'UI Layout Reorganization Instructions',
      instructions: 'Please reorganize the UI layout of the application to make it more user-friendly.',
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
      instructions: 'Please add padding to the scrollbar of the application to make it more user-friendly.',
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
      instructions: 'Please enhance the chat interface of the application to make it more user-friendly.',
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
      instructions: 'Please create a project X.',
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
      name: 'ui',
      color: 'yellow'
    },
    {
      id: 'Tag-2',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'design',
      color: 'blue'
    },
    {
      id: 'Tag-3',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'frontend',
      color: 'green'
    },
    {
      id: 'Tag-4',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'css',
      color: 'orange'
    },
    {
      id: 'Tag-5',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'chat',
      color: 'purple'
    },
    {
      id: 'Tag-6',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'project',
      color: 'red'
    },
    {
      id: 'Tag-7',
      entityType: EARS.Entity.Tag,
      createdAt: nowMs,
      name: 'backend',
      color: 'pink'
    },
    /*───────────────────────────────────────────────────────────────*
     * Message entities                                              *
     *───────────────────────────────────────────────────────────────*/
    { 
      id: 'Message-1', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 5 * 60_000,
      text: 'I\'m working on implementing a new design system for our web application, and I\'ve heard CSS variables could help make our styles more maintainable. Can you help me understand how to use CSS variables effectively? I\'m particularly interested in how they could help us maintain consistency across different components and make theme updates easier.',
      sender: 'user',
      timestamp: nowMs - 5 * 60_000
    },
    { 
      id: 'Message-2', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 4 * 60_000,
      text: 'CSS variables, also known as custom properties, are a powerful feature for building maintainable design systems. They allow you to define reusable values that can be referenced throughout your stylesheets. The syntax follows this pattern: `--variable-name: value;` when defining, and `var(--variable-name)` when using them.\n\nOne of the biggest advantages is that you can update these values in one place and see the changes reflect across your entire application. They also support features like fallback values and can be modified dynamically using JavaScript. Let me show you a practical example in the canvas area above.',
      sender: 'assistant',
      timestamp: nowMs - 4 * 60_000
    },
    { 
      id: 'Message-3', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 3 * 60_000,
      text: 'That explanation really helps! I think I see how this could improve our codebase. Could you show me a specific example of how we might implement a color palette using CSS variables? We currently have different shades of blue scattered throughout our CSS files, and it\'s becoming hard to maintain consistency.',
      sender: 'user',
      timestamp: nowMs - 3 * 60_000
    },
    { 
      id: 'Message-4', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 2 * 60_000,
      text: "I've updated the canvas with a comprehensive color palette example using CSS variables. You can define your colors once in the :root selector like this:\n\n:root {\n  --primary-100: #e3f2fd;\n  --primary-500: #2196f3;\n  --primary-900: #0d47a1;\n}\n\nThen use them throughout your CSS with var(--primary-500) for your main brand color, var(--primary-100) for lighter variants, and var(--primary-900) for darker accents. This makes it much easier to maintain a consistent color scheme and update colors globally when needed.",
      sender: 'assistant',
      timestamp: nowMs - 2 * 60_000
    },
    { 
      id: 'Message-5', 
      entityType: EARS.Entity.Message, 
      createdAt: nowMs - 1 * 60_000,
      text: 'This is exactly what we need! Could you help me refactor our current CSS code to use these variables from our design system? I want to make sure we\'re following best practices and maintaining consistency across all components.',
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
      source: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      target: 'Message-1',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      target: 'Message-2',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      target: 'Message-3',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      target: 'Message-4',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.CONTAINS,
      target: 'Message-5',
      info: {},
    },
    
    /*───────────────────────────────────────────────────────────────*
     * Context items                                                 *
     *───────────────────────────────────────────────────────────────*/
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'ContextItem-1',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'ContextItem-2',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'ContextItem-3',
      info: {},
    },
    
    /*───────────────────────────────────────────────────────────────*
     * Canvas content                                                *
     *───────────────────────────────────────────────────────────────*/
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'CanvasItem-1',
      info: {},
    },

    /*───────────────────────────────────────────────────────────────*
     * Thread-tag relationships                                      *
     *───────────────────────────────────────────────────────────────*/
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'Tag-1',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'Tag-2',
      info: {},
    },
    {
      source: 'Thread-1',
      kind: EARS.RelKind.HAS,
      target: 'Tag-3',
      info: {},
    },
    {
      source: 'Thread-2',
      kind: EARS.RelKind.HAS,
      target: 'Tag-4',
      info: {},
    },
    {
      source: 'Thread-2',
      kind: EARS.RelKind.HAS,
      target: 'Tag-3',
      info: {},
    },
    {
      source: 'Thread-3',
      kind: EARS.RelKind.HAS,
      target: 'Tag-1',
      info: {},
    },
    {
      source: 'Thread-3',
      kind: EARS.RelKind.HAS,
      target: 'Tag-5',
      info: {},
    },
    {
      source: 'Thread-3',
      kind: EARS.RelKind.HAS,
      target: 'Tag-2',
      info: {},
    },
    {
      source: 'Thread-4',
      kind: EARS.RelKind.HAS,
      target: 'Tag-6',
      info: {},
    },
    {
      source: 'Thread-4',
      kind: EARS.RelKind.HAS,
      target: 'Tag-7',
      info: {},
    },

    /*───────────────────────────────────────────────────────────────*
     * Parent-child thread relationships                             *
     *───────────────────────────────────────────────────────────────*/
    {
      source: 'Thread-4',
      kind: EARS.RelKind.PARENT_OF,
      target: 'Thread-3',
      info: {},
    },
    {
      source: 'Thread-4',
      kind: EARS.RelKind.PARENT_OF,
      target: 'Thread-2',
      info: {},
    },
    {
      source: 'Thread-2',
      kind: EARS.RelKind.PARENT_OF,
      target: 'Thread-1',
      info: {},
    },
  ],
};
