import { v4 as uuid } from 'uuid';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface ActionItem {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  timestamp: Date;
}

export interface ContextItem {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'code' | 'image' | 'json';
}

export interface CanvasContent {
  id: string;
  type: 'text' | 'code' | 'image' | 'graph' | 'table';
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  content: string | any;
}

export interface Thread {
  id: string;
  title: string;
  timestamp: Date;
}

export interface AgentPluginData {
  messages: Message[];
  contextItems: ContextItem[];
  canvasContent: CanvasContent;
  threads: Thread[];
}

const messages: Message[] = [
  {
    id: uuid(),
    content: 'Can you help me understand how to use CSS variables in my design system?',
    role: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 5)
  },
  {
    id: uuid(),
    content: 'CSS variables (also known as custom properties) allow you to store specific values to reuse throughout a document. They follow this syntax: `--variable-name: value;`\n\nLet me show you an example in the canvas area above.',
    role: 'assistant',
    timestamp: new Date(Date.now() - 1000 * 60 * 4)
  },
  {
    id: uuid(),
    content: 'That makes sense. Can you show me how to use them with a color palette?',
    role: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 3)
  },
  {
    id: uuid(),
    content: "Sure! I've updated the canvas with a color palette example using CSS variables. You can define your colors once in the :root selector and then reuse them throughout your CSS.",
    role: 'assistant',
    timestamp: new Date(Date.now() - 1000 * 60 * 2)
  },
  {
    id: uuid(),
    content: 'please rewrite this code using css variables from our design systems',
    role: 'user',
    timestamp: new Date(Date.now() - 1000 * 60)
  }
];

const contextItems: ContextItem[] = [
  {
    id: uuid(),
    title: 'Project Overview',
    content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
    type: 'text'
  },
  {
    id: uuid(),
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
    type: 'code'
  },
  {
    id: uuid(),
    title: 'Color Palette',
    content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
    type: 'text'
  }
];

const canvasContent: CanvasContent = {
  id: uuid(),
  type: 'code',
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
};

const threads: Thread[] = [
  {
    id: '1',
    title: 'UI Layout Reorganization Instructions',
    timestamp: new Date(Date.now() - 1000 * 60 * 9) // 9 minutes ago
  },
  {
    id: '2',
    title: 'Adding Padding to Scrollbar in CSS',
    timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
  },
  {
    id: '3',
    title: 'Enhancing Chat Interface Design',
    timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
  }
];

export const agentPluginData: AgentPluginData = {
  messages,
  contextItems,
  canvasContent,
  threads
};

export default agentPluginData;
