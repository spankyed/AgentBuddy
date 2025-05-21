export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant' | 'system';
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