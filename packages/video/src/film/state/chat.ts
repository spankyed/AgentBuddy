import type {
  ActionButtonsBlockState,
  ApprovalBlockState,
  ButtonGroupBlockState,
  ChoiceBlockState,
  ContextUsageBlockState,
  FilePickerBlockState,
  LinkBlockState,
  MarkdownBlockState,
  NoteBlockState,
  PlanArtifactState,
  PromptBlockState,
  ProjectSelectBlockState,
  QuestionBlockState,
  SessionListBlockState,
  TextInputBlockState,
  ThinkingBlockState,
  TogglesBlockState,
  ToolActivityBlockState,
  ToolInputBlockState,
} from '../../agentbuddy-ui/threads/threadTypes';
import type {ChatComposerInlineNode, ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {REFERENCE_CATEGORIES} from '../../agentbuddy-ui/chat/referenceConfig';
import {filmProjects} from './paths';
import {ease, mix, textReveal} from './timeline';

const launchNotePreviewUrl = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%20160%22%3E%3Crect%20width%3D%22160%22%20height%3D%22160%22%20fill%3D%22%231b1b1b%22%2F%3E%3Crect%20x%3D%2220%22%20y%3D%2224%22%20width%3D%22120%22%20height%3D%22112%22%20rx%3D%2210%22%20fill%3D%22%23262626%22%20stroke%3D%22%23525252%22%2F%3E%3Cpath%20d%3D%22M38%2054h84M38%2074h70M38%2094h92M38%20114h48%22%20stroke%3D%22%23d4d4d4%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22118%22%20cy%3D%22118%22%20r%3D%2212%22%20fill%3D%22%233b82f6%22%2F%3E%3C%2Fsvg%3E';
const recentThreadTimestamps = {
  now: new Date('2026-05-27T19:52:00').getTime(),
  twoMinutesAgo: new Date('2026-05-27T19:50:00').getTime(),
  eightMinutesAgo: new Date('2026-05-27T19:44:00').getTime(),
};

const referenceCategorySuggestions = (query = '') => {
  const normalizedQuery = query.toLowerCase();
  return REFERENCE_CATEGORIES
    .filter(category => category.label.toLowerCase().includes(normalizedQuery))
    .map(category => category.id);
};

export type ChatShotView = {
  breadcrumbs: string[];
  composer: ChatComposerState;
  conversation: {
    additionalAssistantMessages?: Array<{
      approval?: ApprovalBlockState;
      autoHide?: boolean;
      markdown: string;
      markdownBlock?: MarkdownBlockState;
      promptBlock?: PromptBlockState;
      style?: {
        opacity: number;
        transform: string;
      };
      thinking?: ThinkingBlockState;
      toolActivity?: ReturnType<typeof toolActivityViewForFrame>;
    }>;
    assistant: {
      approval?: ApprovalBlockState;
      markdown: string;
      markdownBlock?: MarkdownBlockState;
      promptBlock?: PromptBlockState;
      thinking?: ThinkingBlockState;
      toolActivity?: ReturnType<typeof toolActivityViewForFrame>;
    };
    createdAt: string;
    systemMessage?: string;
    userMessage: {
      caretVisible: boolean;
      content?: ChatComposerInlineNode[];
      text: string;
    };
  };
  conversationStyle: {
    opacity: number;
    transform: string;
  };
  messageStyles: {
    assistant: {
      opacity: number;
      transform: string;
    };
    system: {
      opacity: number;
      transform: string;
    };
    user: {
      opacity: number;
      transform: string;
    };
  };
};

export const launchComposerState: ChatComposerState = {
  placeholder: 'Message Agent',
  mode: 'Codex',
  modeOptions: [
    {name: 'Codex', phases: [{name: 'Plan', color: '#2563eb'}, {name: 'Act', color: '#16a34a'}]},
    {name: 'Ask', phases: [{name: 'Read', color: '#525252'}]},
    {name: 'Agent', phases: [{name: 'Plan', color: '#7c3aed'}, {name: 'Run', color: '#ea580c'}]},
    {name: 'Birth', disabled: true},
  ],
  phase: 'Plan',
  quickPrompts: [
    {id: 'qp-review', text: 'Conduct a thorough review of these changes for bugs and completeness, than report back with findings'},
    {id: 'qp-create-ticket', text: 'create the next thread from this plan'},
    {id: 'qp-link-parent', text: 'link this to the parent ticket'},
  ],
  bottomTabs: {
    activeLabel: 'AgentBuddy launch film',
  },
};

export const launchComposerWithAttachmentState: ChatComposerState = {
  ...launchComposerState,
  attachments: [{type: 'image', label: 'image 1', previewUrl: launchNotePreviewUrl}],
};

export const launchComposerModeMenuState: ChatComposerState = {
  ...launchComposerState,
  openSelector: 'mode',
};

export const launchComposerPhaseMenuState: ChatComposerState = {
  ...launchComposerState,
  openSelector: 'phase',
};

export const messageBubbleDemoState = {
  aside: 'Approved launch plan - 4 tickets created',
  createdAt: '9:41 AM',
  longUser: 'Use the attached launch notes and screenshot to turn this into a concise execution path. Keep the release positioning tight, create tickets for the launch film, source-control polish, PR flow, and flow-blueprint review, then produce a single plan that can be shipped from the same work surface.',
  marker: '3 compacted messages',
  references: {
    files: [{name: 'release-brief.md', typeLabel: 'Markdown'}],
    images: [{name: 'launch-note.png', url: launchNotePreviewUrl}],
  },
  system: 'Launch AgentBuddy',
  user: 'Turn this launch brief into tickets, notes, and a shippable PR plan.',
  commandUser: '/launch-film create tickets from the current tasklist',
  queuedUser: 'Queue the release checklist after this plan is approved.',
  cancelledUser: 'Draft the old tutorial carousel again.',
  assistant: 'I found the launch context and turned it into an execution plan.',
};

export const chatShotState = {
  breadcrumbs: ['Threads', 'Launch Thread'],
  createdAt: '9:41 AM',
  systemMessage: undefined,
  prompt: {text: 'Use #notes:current and this screenshot to turn the launch into execution tickets.', from: 24, to: 186, caretUntil: 270},
  response: {text: 'I’ll turn this into an implementation pass: create the tickets, preserve the referenced context, and prepare the branch and PR path before editing code.', from: 306, to: 346},
};

const reviewQuickPromptText = 'Conduct a thorough review of these changes for bugs and completeness, than report back with findings';

const completedDevThreadResponse = 'The launch film branch is ready for the commit pass. I aligned the chat input, Recent Threads menu, source-control panel, PR flow, and flow-blueprint surfaces against the real app UI, then ran the video checks.';

const launchPlanMarkdown = `## AgentBuddy Launch Film -> Execution Pass

### Context

The launch thread has the current tasklist, referenced notes, and product screenshot in one place. The next step is to turn that context into implementation work without leaving the thread.

Goal: create the execution tickets, pin the launch thread, and prepare the source-control path for a shippable PR.

### Key Discovery

The existing tasklist already identifies the film polish work: chat fidelity, notes navigation, code/PR flow, flow-blueprint review, and final render checks.

The screenshot gives enough product context to keep those tasks tied to the same launch surface instead of splitting the work across disconnected tools.

### Implementation Plan

- Create execution tickets from the current tasklist and screenshot.
- Pin the launch thread for the implementation pass.
- Prepare the branch plan and PR checklist.
- Keep the notes/tasklist context linked to the parent thread.
- Review the launch film for ghost actions, abrupt transitions, and non-1:1 UI states.
- Render the landscape cut and capture focused stills for any remaining issues.

### Files

\`packages/video/src/film/state/chat.ts\` - tighten chat timing and plan handoff.

\`packages/video/src/agentbuddy-ui/threads\` - align thread interaction blocks with the renderer UI.

\`packages/video/src/film/shots\` - keep cursor actions attached to visible UI changes.`;

const completedDevThreadActivity: ToolActivityBlockState = {
  defaultOpen: false,
  entries: [
    {id: 'inspect-ui', tool: 'Read', summary: 'packages/video/src/agentbuddy-ui', status: 'ok', durationMs: 420, outputSummary: 'UI surfaces reviewed'},
    {id: 'patch-chat', tool: 'Edit', summary: 'chat input, recent threads, thread state handoff', status: 'ok', durationMs: 1300, outputSummary: 'Composer and thread transition aligned'},
    {id: 'patch-code-pr', tool: 'Edit', summary: 'source control and pull request panels', status: 'ok', durationMs: 1900, outputSummary: 'PR path ready for launch film'},
    {id: 'render-video', tool: 'Bash', summary: 'npm run video:render', status: 'ok', durationMs: 8600, outputSummary: 'Landscape cut rendered'},
  ],
  phase: launchComposerState.phase,
  state: 'done',
};

export const chatToolActivity: ToolActivityBlockState = {
  defaultOpen: false,
  entries: [
    {id: 'read-launch-notes', tool: 'Read', summary: 'notes/agentbuddy/tasklist/current.md', status: 'ok', durationMs: 312, outputSummary: 'Launch notes loaded'},
    {id: 'create-tickets', tool: 'Task', summary: 'create execution tickets from launch context', status: 'ok', durationMs: 1280, outputSummary: '4 tickets created'},
    {id: 'write-plan', tool: 'Write', summary: 'packages/video/src/film/state/launch-plan.ts', status: 'running'},
    {id: 'compile-flows', tool: 'Bash', summary: 'npm run compile:flows', status: 'running', durationMs: 5200},
  ],
  phase: launchComposerState.phase,
  state: 'streaming',
};

export const launchPlanArtifact: PlanArtifactState = {
  id: 'launch-operating-plan',
  title: 'Launch Operating Plan',
  content: {
    status: 'in-progress',
    nextStep: 'Review release checklist',
    notes: '### Launch path\n- [x] Capture **launch context**\n- [x] Create execution tickets\n- [x] Pin launch thread\n- [ ] Review release checklist\n\n| Surface | State |\n| --- | --- |\n| Thread plan | active |\n| Parent ticket | linked |\n\n> Conversation becomes work.',
    steps: [
      {id: 'capture-context', title: 'Capture launch context', status: 'done'},
      {id: 'execution-tickets', title: 'Create execution tickets', status: 'done'},
      {id: 'pin-thread', title: 'Pin launch thread', status: 'done'},
      {id: 'release-checklist', title: 'Review release checklist', status: 'running'},
    ],
  },
};

export const thinkingBlockDemoState: ThinkingBlockState = {
  defaultOpen: true,
  label: 'Thinking',
  state: 'done',
  content: 'Need to preserve the launch thread context, create a PR path, and keep the flow blueprint as design-time automation rather than runtime execution.',
};

export const toolInputBlockDemoState: ToolInputBlockState = {
  toolName: 'Edit',
  input: {
    file_path: 'packages/video/src/film/state/chat.ts',
    old_string: 'scene -> one screenshot\nstatic overlay copy\nplaceholder controls',
    new_string: 'moment -> reusable app surface\nauthored Remotion motion\nreal component replicas',
  },
};

export const toolInputWriteDemoState: ToolInputBlockState = {
  toolName: 'Write',
  input: {
    file_path: 'packages/video/src/agentbuddy-ui/threads/ToolInputBlock.tsx',
    content: 'export function ToolInputBlock({state}) {\n  return <ReadonlyEditor state={state} />;\n}\n\nconst mode = \"renderer-preview\";\n',
  },
};

export const toolInputBashDemoState: ToolInputBlockState = {
  toolName: 'Bash',
  input: {
    command: 'npm run video:verify',
  },
};

export const toolInputJsonDemoState: ToolInputBlockState = {
  toolName: 'Read',
  input: {
    path: 'packages/video/src/agentbuddy-ui/FIDELITY.md',
    offset: 1,
    limit: 20,
  },
};

export const approvalBlockDemoState: ApprovalBlockState = {
  allowReason: true,
  approveLabel: 'Approve',
  autoAcceptOption: true,
  denyLabel: 'Deny',
  reason: 'This matches the launch-film direction.',
  reasonPlaceholder: 'Enter your reason...',
};

export const launchPlanApprovalState: ApprovalBlockState = {
  options: [
    {label: 'Yes, clear context and auto-accept edits', variant: 'primary'},
    {label: 'Yes, auto-accept edits', variant: 'secondary'},
    {label: 'Deny', variant: 'neutral'},
  ],
};

export const launchPlanThinkingState: ThinkingBlockState = {
  defaultOpen: true,
  label: 'Thinking',
  state: 'streaming',
  content: 'Preparing the execution pass from the approved launch plan. Loading the completed implementation thread and preserving the launch context.',
};

export const approvalBlockRespondedState: ApprovalBlockState = {
  disabled: true,
  response: {
    approved: true,
  },
};

export const actionButtonsBlockDemoState: ActionButtonsBlockState = {
  buttons: ['submit', 'cancel'],
  submitLabel: 'Run action',
  submitVariant: 'success',
};

export const actionButtonsDisabledDemoState: ActionButtonsBlockState = {
  buttons: ['submit', 'cancel'],
  cancelLabel: 'Cancel',
  submitDisabled: true,
  submitLabel: 'Waiting',
};

export const choiceBlockDemoState: ChoiceBlockState = {
  allowCustom: true,
  choices: [
    {id: 'ship-pr', label: 'Ship PR flow', description: 'Feature the publish, create PR, and details views.'},
    {id: 'flow-blueprints', label: 'Show flow blueprints', description: 'Keep automation design-time and status-free.'},
    {id: 'notes-memory', label: 'Connect notes memory', description: 'Tie notes, tasks, and thread context together.'},
  ],
  customPlaceholder: 'Describe another launch surface...',
  selectedIds: ['ship-pr'],
  skipOption: {id: 'skip', label: 'Skip for now'},
};

export const choiceBlockRespondedState: ChoiceBlockState = {
  choices: [],
  disabled: true,
  displayText: 'Selected:',
  response: 'Ship PR flow',
};

export const questionBlockDemoState: QuestionBlockState = {
  customPlaceholder: 'Name a different surface...',
  currentStep: 0,
  questions: [
    {
      allowCustom: true,
      options: [
        {id: 'pr-flow', label: 'PR flow', description: 'Publish branch, create PR, then show details.'},
        {id: 'tasklist', label: 'Tasklist', description: 'Edit notes, tasks, and launch context.'},
        {id: 'flows', label: 'Flow blueprints', description: 'Show automation as design-time blueprints.'},
      ],
      question: 'Which launch surface should lead the next cut?',
    },
  ],
  selectedIds: ['pr-flow'],
};

export const questionBlockRespondedState: QuestionBlockState = {
  disabled: true,
  questions: [
    {
      options: [{id: 'pr-flow', label: 'PR flow'}],
      question: 'Which launch surface should lead the next cut?',
    },
  ],
  response: 'PR flow',
};

export const buttonGroupBlockDemoState: ButtonGroupBlockState = {
  buttons: [
    {id: 'publish', label: 'Publish branch', variant: 'primary'},
    {id: 'draft', label: 'Create draft', variant: 'secondary'},
    {id: 'close', label: 'Close', variant: 'danger'},
  ],
};

export const buttonGroupRespondedState: ButtonGroupBlockState = {
  buttons: [{id: 'publish', label: 'Publish branch', variant: 'primary'}],
  disabled: true,
  displayText: 'Button pressed',
  response: {buttonId: 'publish'},
};

export const promptBlockDemoState: PromptBlockState = {
  content: 'Confirm the launch cut should emphasize real product surfaces over tutorial walkthroughs.',
};

export const noteBlockDemoState: NoteBlockState = {
  content: 'Flow blueprints stay design-time only. No runtime status indicators in the flow plugin shot.',
  label: 'Launch note',
  variant: 'warning',
};

export const markdownBlockDemoState: MarkdownBlockState = {
  content: '### Launch checklist\n- [x] Real UI surfaces\n- [x] PR flow complete\n- [ ] Review [release note](note://current)\n\n| Review | Owner |\n| --- | --- |\n| code/pr | ready |\n| flows | needs pass |\n\n```ts\nconst surface = \"renderer-faithful\";\n```',
  label: 'Generated summary',
};

export const togglesBlockDemoState: TogglesBlockState = {
  toggles: [
    {id: 'ship-pr', label: 'Create PR after publish', default: true},
    {id: 'notify-launch', label: 'Notify launch thread', description: 'Post the final checklist', default: false},
  ],
};

export const sessionListBlockDemoState: SessionListBlockState = {
  sessions: [
    {id: '9f42c8a710ef', title: 'React launch film', modifiedAt: '2m ago', size: 428_000},
    {id: '77bb1a4d52a0', title: 'Flow blueprint review', modifiedAt: '18m ago', size: 214_000},
    {id: '43d0ac921eb4', title: '(untitled)', modifiedAt: '1h ago', size: 92_000},
  ],
};

export const linkBlockDemoState: LinkBlockState = {
  links: [
    {icon: 'file-text', label: 'Open launch note'},
    {icon: 'message-square', label: 'View source thread'},
    {icon: 'external-link', label: 'Open PR'},
  ],
};

export const contextUsageBlockDemoState: ContextUsageBlockState = {
  model: 'claude-sonnet-4.5',
  totalTokens: 128_400,
  maxTokens: 200_000,
  percentage: 64,
  categories: [
    {name: 'System prompt', tokens: 12_800, percentage: 6.4},
    {name: 'System tools', tokens: 18_400, percentage: 9.2},
    {name: 'Memory files', tokens: 24_600, percentage: 12.3},
    {name: 'Skills', tokens: 8_200, percentage: 4.1},
    {name: 'Messages', tokens: 64_400, percentage: 32.2},
  ],
  memoryFiles: [
    {type: 'note', path: '/AgentBuddy/Tasklist/current.md', tokens: 7400},
    {type: 'brief', path: '/AgentBuddy/Videos/launch-film.md', tokens: 5200},
  ],
  skills: [
    {name: 'launch-film-fidelity', source: 'workspace', tokens: 8200},
  ],
};

export const textInputBlockDemoState: TextInputBlockState = {
  multiline: true,
  placeholder: 'Enter launch note...',
  rows: 2,
  suggestions: ['Tighten the launch cut', 'Show the PR flow'],
  value: 'Focus on the real app surfaces.',
};

export const filePickerBlockDemoState: FilePickerBlockState = {
  allowMultiple: true,
  fileType: 'file',
  selectedPaths: ['packages/video/src/film/state/chat.ts', 'packages/video/src/agentbuddy-ui/threads/MessageBubble.tsx'],
};

export const projectSelectBlockDemoState: ProjectSelectBlockState = {
  projects: [
    {name: 'AgentBuddy', color: '#3b82f6', directories: [filmProjects.agentBuddy]},
    {name: 'Clientlabs', color: '#10b981', directories: [filmProjects.clientlabs]},
  ],
};

export const projectSelectRespondedState: ProjectSelectBlockState = {
  disabled: true,
  displayText: 'Selected project:',
  response: filmProjects.agentBuddy,
  projects: [
    {name: 'AgentBuddy', color: '#3b82f6', directories: [filmProjects.agentBuddy]},
  ],
};

const recentThreadsClickStart = 406;
const recentThreadsClickEnd = 418;
const recentThreadsMenuStart = 438;
const recentThreadsMenuEnd = 508;
const recentThreadSelectStart = 448;
const recentThreadLoadedStart = 508;
const quickPromptClickStart = 516;
const quickPromptClickEnd = 528;
const quickPromptMenuStart = 530;
const quickPromptMenuEnd = 570;
const quickPromptTextStart = 572;
const quickPromptSendStart = 586;
const quickPromptSendEnd = 598;
const quickPromptResponseStart = 660;
const quickPromptResponseEnd = 660;

export function toolActivityViewForFrame(frame: number) {
  return {
    rowOpacities: chatToolActivity.entries.map((_, index) => ease(frame, 234 + index * 14, 250 + index * 14)),
    state: frame > 290 ? {...chatToolActivity, state: 'done' as const} : chatToolActivity,
  };
}

export function completedDevThreadActivityViewForFrame(frame: number) {
  return {
    rowOpacities: completedDevThreadActivity.entries.map((_, index) => ease(frame, recentThreadLoadedStart + 8 + index * 8, recentThreadLoadedStart + 20 + index * 8)),
    state: completedDevThreadActivity,
  };
}

export function chatViewForFrame(frame: number) {
  const quickPromptSent = frame > quickPromptSendEnd;
  const sentUserMessageStyle = frame >= 270
    ? {opacity: 1, transform: 'translateY(0px)'}
    : {opacity: 0, transform: 'translateY(0px)'};
  const messageReveal = (from: number) => {
    const progress = ease(frame, from, from + 18);
    return {
      opacity: progress,
      transform: `translateY(${(1 - progress) * 18}px)`,
    };
  };
  return {
    prompt: textReveal(chatShotState.prompt.text, frame, chatShotState.prompt.from, chatShotState.prompt.to),
    promptCaretVisible: frame < chatShotState.prompt.caretUntil,
    response: textReveal(chatShotState.response.text, frame, chatShotState.response.from, chatShotState.response.to),
    conversationOpacity: ease(frame, 254, 284),
    conversationY: 28 - ease(frame, 254, 284) * 28,
    messageStyles: {
      assistant: messageReveal(250),
      system: messageReveal(210),
      user: quickPromptSent ? messageReveal(quickPromptSendEnd) : sentUserMessageStyle,
    },
    toolActivity: undefined,
  };
}

export function chatShotViewForFrame(frame: number): ChatShotView {
  const view = chatViewForFrame(frame);
  const imageAttachmentEnter = ease(frame, 188, 204);
  const recentThreadLoaded = frame >= recentThreadLoadedStart;
  const showInitialThinking = frame >= 282 && frame < 394;
  const showInitialResponse = frame >= 306 && frame < 394;
  const showPlan = frame >= 370 && frame < 394;
  const showPlanApproval = frame >= 382 && frame < 394;
  const showApprovedSummary = frame >= 394 && frame < recentThreadLoadedStart;
  const showPlanToolActivity = frame >= 394 && frame < recentThreadLoadedStart;
  const quickPromptSent = frame > quickPromptSendEnd;
  const showQuickPromptResponse = frame > quickPromptResponseStart;
  const referenceStartIndex = 'Use '.length;
  const referenceCompleteText = 'Use #notes:current ';
  const selectedNoteReference = view.prompt.startsWith(referenceCompleteText);
  const typedReferenceText = referenceTextFromPrompt(view.prompt);
  const noteReferencePromptContent: ChatComposerInlineNode[] | undefined = selectedNoteReference
    ? [
        {type: 'text', text: 'Use '},
        {type: 'reference', refId: 'notes-current', label: 'current', refType: 'note', shortCode: 'notes-current'},
        {type: 'text', text: view.prompt.slice('#notes:current'.length + 'Use '.length)},
      ]
    : undefined;
  const referenceAutocomplete = typedReferenceText && !selectedNoteReference
    ? typedReferenceText.startsWith('notes:')
      ? {
          anchorCharacterIndex: referenceStartIndex,
          categoryQuery: 'notes:',
          level: 'items' as const,
          query: typedReferenceText.slice('notes:'.length),
          selectedCategory: 'notes' as const,
          suggestions: [
            {id: 'notes-current', label: 'current', shortCode: 'notes-current', type: 'note' as const},
            {id: 'notes-tasklist', label: 'Tasklist', shortCode: 'notes-tasklist', type: 'tasklist' as const},
          ],
        }
      : {
          anchorCharacterIndex: referenceStartIndex,
          categoryQuery: '',
          level: 'category' as const,
          query: typedReferenceText,
          selectedCategory: null,
          suggestions: referenceCategorySuggestions(typedReferenceText),
        }
    : undefined;
  const stableLoadedMessageStyles = {
    assistant: {
      opacity: 1,
      transform: 'translateY(0px)',
    },
    system: {
      opacity: 0,
      transform: 'translateY(0px)',
    },
    user: {
      opacity: 1,
      transform: 'translateY(0px)',
    },
  };
  return {
    breadcrumbs: recentThreadLoaded ? ['Threads', 'Launch PR implementation'] : chatShotState.breadcrumbs,
    composer: {
      ...launchComposerState,
      referenceAutocomplete,
      content: frame < 270 ? noteReferencePromptContent : undefined,
      attachments: [
        ...(frame > 188 && frame < 270 ? [{
          type: 'image' as const,
          label: 'image 1',
          previewUrl: launchNotePreviewUrl,
          style: {
            opacity: imageAttachmentEnter,
            transform: `translateY(${mix(10, 0, imageAttachmentEnter)}px) scale(${mix(0.975, 1, imageAttachmentEnter)})`,
          },
        }] : []),
      ],
      bottomTabs: frame > 188
        ? {
            ...launchComposerState.bottomTabs!,
            activeLabel: recentThreadLoaded ? 'Launch PR implementation' : launchComposerState.bottomTabs!.activeLabel,
            active: frame >= recentThreadLoadedStart ? 'active' : frame > recentThreadsClickStart && frame < recentThreadLoadedStart ? 'recent' : frame > 150 ? 'active' : undefined,
            pressed: frame > recentThreadsClickStart && frame < recentThreadsClickEnd
                ? 'recent'
                : (frame > recentThreadSelectStart && frame < recentThreadLoadedStart) || (frame > quickPromptSendStart && frame < quickPromptSendEnd)
                  ? 'active'
                  : undefined,
            recentThreadsMenu: frame > recentThreadsMenuStart && frame < recentThreadsMenuEnd
              ? {
                  currentId: 'launch-plan',
                  selectedIndex: frame > recentThreadSelectStart ? 0 : -1,
                  threadStates: {
                    'launch-dev-complete': {color: '#22c55e'},
                    'launch-plan': {busy: true},
                    'release-checks': {color: '#f59e0b'},
                  },
                  threads: [
                    {id: 'launch-dev-complete', topic: 'Launch PR implementation', pinned: true, shortCode: 'AB-104', timestamp: recentThreadTimestamps.now},
                    {id: 'launch-plan', topic: 'Launch Operating Plan', shortCode: 'AB-101', timestamp: recentThreadTimestamps.twoMinutesAgo},
                    {id: 'release-checks', topic: 'Release checklist', shortCode: 'AB-118', timestamp: recentThreadTimestamps.eightMinutesAgo},
                  ],
                }
              : undefined,
          }
        : undefined,
      referenceButtonPressed: Boolean(typedReferenceText && !selectedNoteReference),
      quickPromptsButtonPressed: frame > quickPromptClickStart && frame <= quickPromptClickEnd,
      quickPromptsOpen: frame > quickPromptMenuStart && frame < quickPromptMenuEnd,
      quickPromptsSelectedIndex: frame > quickPromptMenuStart + 14 && frame < quickPromptMenuEnd ? 0 : undefined,
      sendPressed: (frame >= 258 && frame < 266) || (frame > quickPromptSendStart && frame < quickPromptSendEnd),
      text: frame >= chatShotState.prompt.from && frame < 270
        ? view.prompt
        : frame > quickPromptTextStart && frame < quickPromptSendEnd
          ? reviewQuickPromptText
          : undefined,
    },
    conversation: {
      additionalAssistantMessages: [
        ...(showPlan ? [{
          approval: showPlanApproval ? launchPlanApprovalState : undefined,
          markdown: '',
          markdownBlock: {label: 'Plan', content: launchPlanMarkdown},
          promptBlock: showPlanApproval ? {content: 'Approve this plan and start implementing?'} : undefined,
          style: {
            opacity: ease(frame, 370, 382),
            transform: `translateY(${(1 - ease(frame, 370, 382)) * 18}px)`,
          },
        }] : []),
        ...(showApprovedSummary ? [{
          autoHide: true,
          markdown: 'Approved launch execution plan — implementation started',
          style: {
            opacity: ease(frame, 394, 404),
            transform: `translateY(${(1 - ease(frame, 394, 404)) * 12}px)`,
          },
        }] : []),
        ...(showPlanToolActivity ? [{
          markdown: '',
          style: {
            opacity: ease(frame, 400, 414),
            transform: `translateY(${(1 - ease(frame, 400, 414)) * 18}px)`,
          },
          toolActivity: {
            rowOpacities: chatToolActivity.entries.map((_, index) => ease(frame, 402 + index * 8, 414 + index * 8)),
            state: chatToolActivity,
          },
        }] : []),
      ],
      assistant: {
        approval: undefined,
        markdown: showQuickPromptResponse
          ? view.response
          : recentThreadLoaded
            ? completedDevThreadResponse
            : showInitialResponse
              ? view.response
              : '',
        markdownBlock: undefined,
        promptBlock: undefined,
        thinking: showInitialThinking ? {
          defaultOpen: true,
          label: 'Thinking',
          state: frame >= chatShotState.response.from ? 'done' : 'streaming',
          content: 'Inspecting the current tasklist, referenced note, and screenshot so the next step can be scoped before any code edits.',
        } : undefined,
        toolActivity: recentThreadLoaded && !showQuickPromptResponse
          ? completedDevThreadActivityViewForFrame(frame)
          : undefined,
      },
      createdAt: chatShotState.createdAt,
      systemMessage: chatShotState.systemMessage,
      userMessage: {
        caretVisible: frame < 270 && view.promptCaretVisible,
        content: showQuickPromptResponse || recentThreadLoaded ? undefined : noteReferencePromptContent,
        text: quickPromptSent ? reviewQuickPromptText : recentThreadLoaded ? 'Polish the launch film UI and prepare the PR path.' : view.prompt,
      },
    },
    conversationStyle: {
      opacity: view.conversationOpacity,
      transform: `translateY(${view.conversationY}px)`,
    },
    messageStyles: recentThreadLoaded && !showQuickPromptResponse ? stableLoadedMessageStyles : view.messageStyles,
  };
}

function referenceTextFromPrompt(prompt: string) {
  const hashIndex = prompt.indexOf('#');
  if (hashIndex === -1) return '';
  const afterHash = prompt.slice(hashIndex + 1);
  if (!afterHash) return '';
  return afterHash.split(/\s/, 1)[0] ?? '';
}
