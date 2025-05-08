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
