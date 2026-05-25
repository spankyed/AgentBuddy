import type {LibrarySurfaceState} from '../../agentbuddy-ui/library/libraryTypes';

export const librarySurfaceState: LibrarySurfaceState = {
  activeCollectionId: 'commands',
  activeItemId: 'launch-command',
  collections: [
    {id: 'commands', label: 'Commands', count: 18},
    {id: 'docs', label: 'Documents', count: 42},
    {id: 'snippets', label: 'Snippets', count: 31},
    {id: 'faqs', label: 'FAQs', count: 9},
  ],
  items: [
    {id: 'launch-command', kind: 'command', title: 'Prepare launch thread', updatedAt: '2m ago', status: 'active'},
    {id: 'release-notes', kind: 'document', title: 'Release notes template', updatedAt: '14m ago'},
    {id: 'demo-script', kind: 'snippet', title: 'Launch demo script', updatedAt: '1h ago'},
    {id: 'support-faq', kind: 'faq', title: 'GitHub token FAQ', updatedAt: 'yesterday'},
  ],
  preview: {
    title: 'Prepare launch thread',
    metadata: [
      {label: 'type', value: 'command'},
      {label: 'owner', value: 'AgentBuddy'},
      {label: 'updated', value: '2m ago'},
    ],
    body: [
      'Collect linked notes, current source-control context, release tasks, and workflow outputs into one launch thread.',
      'Use this command before publishing the branch so the thread includes the final checklist and PR summary.',
    ],
  },
};
