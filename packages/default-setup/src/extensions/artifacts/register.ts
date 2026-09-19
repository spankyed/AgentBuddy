import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import {
  FileText, Code, CheckSquare, Image, MessageSquare, ListTodo,
  Layers, GitBranch, Wrench, Network, Table, ClipboardList,
  BookText, StickyNote, Bot,
} from 'lucide-vue-next';

export const artifacts: ArtifactDefinition[] = [
  { type: 'text', fe: { icon: FileText } },
  { type: 'code', fe: { icon: Code } },
  { type: 'review', fe: { icon: CheckSquare } },
  { type: 'image', fe: { icon: Image } },
  { type: 'slack', fe: { icon: MessageSquare } },
  { type: 'todo', fe: { icon: ListTodo } },
  { type: 'project', fe: { icon: Layers } },
  { type: 'json', fe: { icon: FileText } },
  { type: 'graph', fe: { icon: Network } },
  { type: 'table', fe: { icon: Table } },
  { type: 'markdown', fe: { icon: BookText } },
  { type: 'claude-session', fe: { icon: Wrench } },
  { type: 'codex-session', fe: { icon: Bot } },
  { type: 'diff', fe: { icon: GitBranch } },
  { type: 'plan', fe: { icon: ClipboardList } },
  { type: 'note', fe: { icon: StickyNote } },
];
