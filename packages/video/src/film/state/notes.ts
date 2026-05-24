import type {NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';

export const notesTaskListItems: NoteTreeNodeState[] = [
  {id: 'default', title: 'default setup', icon: '🚧', noteType: 'task'},
  {id: 'current', title: 'current', icon: '🔥', noteType: 'task'},
  {id: 'remotion', title: 'remotion', noteType: 'task', children: []},
  {id: 'phone', title: 'phone app', noteType: 'task'},
  {id: 'bugs', title: 'bugs', icon: '🪲', noteType: 'task'},
  {id: 'manager', title: 'manager mode', noteType: 'task'},
  {id: 'bg', title: 'bg processes', noteType: 'task'},
  {id: 'chat', title: 'chat layout redesign', noteType: 'task', completed: true, muted: true},
  {id: 'roadmap', title: 'V1 Roadmap', icon: '🗺️', noteType: 'task'},
  {id: 'artifacts', title: 'artifacts & msg blocks', noteType: 'task'},
];

export const notesRailFavorites: NoteTreeNodeState[] = [
  {id: 'fav-current', icon: '🔥', title: 'current', noteType: 'document'},
  {id: 'fav-cli', icon: '💻', title: 'cli', noteType: 'document'},
  {id: 'fav-videos', icon: '🎬', title: 'Videos', noteType: 'document'},
];

export const notesRailTree: NoteTreeNodeState[] = [
  {id: 'clientlabs', icon: '🌐', title: 'Clientlabs', noteType: 'document'},
  {id: 'agentbuddy', icon: '🚀', title: 'Agentbuddy', noteType: 'document'},
  {id: 'tasklist', icon: '📝', title: 'Tasklist', noteType: 'tasklist'},
  {id: 'brand', icon: '⭐', title: 'Brand & Content', noteType: 'document'},
];

export const notesEditorCopy = {
  breadcrumbs: ['Notes', 'AgentBuddy', 'Tasklist', 'Current'],
  beforeLines: ['provocative posts', '3 clips a week for clientlabs yt'],
  animatedLines: [
    'demo different features with cinematic product scenes',
    'conversation becomes tickets, notes, code, and workflows',
    'same surface, same memory, no context handoff',
  ],
};
