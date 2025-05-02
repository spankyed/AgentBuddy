import { Message, ActionItem, ContextItem, CanvasContent } from '../types';

export const mockMessages: Message[] = [
  {
    id: '1',
    content: 'Can you help me understand how to use CSS variables in my design system?',
    role: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 5)
  },
  {
    id: '2',
    content: 'CSS variables (also known as custom properties) allow you to store specific values to reuse throughout a document. They follow this syntax: `--variable-name: value;`\n\nLet me show you an example in the canvas area above.',
    role: 'assistant',
    timestamp: new Date(Date.now() - 1000 * 60 * 4)
  },
  {
    id: '3',
    content: 'That makes sense. Can you show me how to use them with a color palette?',
    role: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 3)
  },
  {
    id: '4',
    content: "Sure! I've updated the canvas with a color palette example using CSS variables. You can define your colors once in the :root selector and then reuse them throughout your CSS.",
    role: 'assistant',
    timestamp: new Date(Date.now() - 1000 * 60 * 2)
  },
  {
    id: '5',
    content: 'please rewrite this code using css variables from our design systems',
    role: 'user',
    timestamp: new Date(Date.now() - 1000 * 60)
  }
];

export const mockActions: ActionItem[] = [
  {
    id: '1',
    description: 'Remove code comments',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 3)
  },
  {
    id: '2',
    description: 'Verify folder structure',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60 * 2)
  },
  {
    id: '3',
    description: 'Run test coverage',
    status: 'completed',
    timestamp: new Date(Date.now() - 1000 * 60)
  },
  {
    id: '4',
    description: 'Add new test',
    status: 'in-progress',
    timestamp: new Date()
  },
  {
    id: '5',
    description: 'Check task finished',
    status: 'pending',
    timestamp: new Date()
  },
  {
    id: '6',
    description: 'Respond "yes drill sergeant!"',
    status: 'pending',
    timestamp: new Date()
  }
];

export const mockContextItems: ContextItem[] = [
  {
    id: '1',
    title: 'Project Overview',
    content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
    type: 'text'
  },
  {
    id: '2',
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
    id: '3',
    title: 'Color Palette',
    content: 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \'Content here, content here\', making it look like readable English.',
    type: 'text'
  }
];

export const mockCanvasContent: CanvasContent = {
  id: '1',
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