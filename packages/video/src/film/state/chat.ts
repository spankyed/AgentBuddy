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
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {filmProjects} from './paths';
import {ease, mix, textReveal} from './timeline';

export type ChatShotView = {
  breadcrumbs: string[];
  composer: ChatComposerState;
  conversation: {
    assistant: {
      artifact?: PlanArtifactState;
      markdown: string;
      toolActivity?: ReturnType<typeof toolActivityViewForFrame>;
    };
    createdAt: string;
    systemMessage?: string;
    userMessage: {
      caretVisible: boolean;
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
  cursorPath: {
    end: number;
    from: [number, number];
    start: number;
    to: [number, number];
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
    {id: 'qp-write-commit', text: 'write a commit'},
    {id: 'qp-create-ticket', text: 'create the next thread from this plan'},
    {id: 'qp-link-parent', text: 'link this to the parent ticket'},
  ],
  bottomTabs: {
    activeLabel: 'AgentBuddy launch film',
    newThreadLabel: 'New thread',
    recentLabel: 'Recent Threads',
  },
};

export const launchComposerWithAttachmentState: ChatComposerState = {
  ...launchComposerState,
  attachments: [{type: 'image', label: 'image 1'}],
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
  references: [
    {
      isImage: true,
      name: 'launch-note.png',
      previewUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%20160%22%3E%3Crect%20width%3D%22160%22%20height%3D%22160%22%20fill%3D%22%231b1b1b%22%2F%3E%3Crect%20x%3D%2220%22%20y%3D%2224%22%20width%3D%22120%22%20height%3D%22112%22%20rx%3D%2210%22%20fill%3D%22%23262626%22%20stroke%3D%22%23525252%22%2F%3E%3Cpath%20d%3D%22M38%2054h84M38%2074h70M38%2094h92M38%20114h48%22%20stroke%3D%22%23d4d4d4%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22118%22%20cy%3D%22118%22%20r%3D%2212%22%20fill%3D%22%233b82f6%22%2F%3E%3C%2Fsvg%3E',
      typeLabel: 'Image',
    },
    {name: 'release-brief.md', typeLabel: 'Markdown'},
  ],
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
  cursorPath: {from: [58, 74] as [number, number], to: [82, 84] as [number, number], start: 34, end: 96},
  systemMessage: undefined,
  prompt: {text: 'Use #notes:current and this screenshot to turn the launch into execution tickets.', from: 82, to: 148, caretUntil: 152},
  response: {text: 'I found the launch context and turned it into execution work: tickets, a linked parent thread, and a clean next step for `write a commit`.', from: 190, to: 264},
};

const commitMessageResponse = `Here's the commit message:

\`\`\`
feat(video): turn launch context into execution tickets

Create the launch operating plan, link the parent thread,
and queue the next implementation pass from the same surface.
\`\`\``;

const completedDevThreadResponse = 'The launch film branch is ready for the commit pass. I aligned the chat input, Recent Threads menu, source-control panel, PR flow, and flow-blueprint surfaces against the real app UI, then ran the video checks.';

const completedDevThreadActivity: ToolActivityBlockState = {
  defaultOpen: true,
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
  artifactRef: {
    artifactId: 'launch-operating-plan',
    label: 'Launch Operating Plan',
  },
  defaultOpen: true,
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
    notes: '### Launch path\n- [x] Capture **launch context**\n- [x] Create execution tickets\n- [x] Pin launch thread\n- [ ] Write commit\n\n| Surface | State |\n| --- | --- |\n| Thread plan | active |\n| Parent ticket | linked |\n\n```sh\nwrite a commit\n```\n\n> Conversation becomes work.',
    steps: [
      {id: 'capture-context', title: 'Capture launch context', status: 'done'},
      {id: 'execution-tickets', title: 'Create execution tickets', status: 'done'},
      {id: 'pin-thread', title: 'Pin launch thread', status: 'done'},
      {id: 'commit-prompt', title: 'Send quick prompt: write a commit', status: 'running'},
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

export const approvalBlockRespondedState: ApprovalBlockState = {
  disabled: true,
  response: {
    approved: true,
    reason: 'Use the real UI replica path and continue.',
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
  content: '### Launch checklist\n- [x] Real UI surfaces\n- [x] PR flow complete\n- [ ] Blueprint fidelity reviewed\n\n| Review | Owner |\n| --- | --- |\n| code/pr | ready |\n| flows | needs pass |\n\n```ts\nconst surface = \"renderer-faithful\";\n```\n\nRead the [release note](agentbuddy://notes/current).',
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

export function toolActivityViewForFrame(frame: number) {
  return {
    rowOpacities: chatToolActivity.entries.map((_, index) => ease(frame, 174 + index * 14, 190 + index * 14)),
    state: frame > 230 ? {...chatToolActivity, state: 'done' as const} : chatToolActivity,
  };
}

export function completedDevThreadActivityViewForFrame(frame: number) {
  return {
    rowOpacities: completedDevThreadActivity.entries.map((_, index) => ease(frame, 214 + index * 8, 226 + index * 8)),
    state: completedDevThreadActivity,
  };
}

export function chatViewForFrame(frame: number) {
  const quickPromptActive = frame > 324;
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
    response: quickPromptActive
      ? textReveal(commitMessageResponse, frame, 326, 386)
      : textReveal(chatShotState.response.text, frame, chatShotState.response.from, chatShotState.response.to),
    conversationOpacity: ease(frame, 110, 146),
    conversationY: 28 - ease(frame, 110, 146) * 28,
    messageStyles: {
      assistant: messageReveal(quickPromptActive ? 326 : 190),
      system: messageReveal(150),
      user: messageReveal(quickPromptActive ? 292 : 154),
    },
    toolActivity: undefined,
  };
}

export function chatShotViewForFrame(frame: number): ChatShotView {
  const view = chatViewForFrame(frame);
  const imageAttachmentEnter = ease(frame, 132, 148);
  const recentThreadLoaded = frame >= 214;
  const showLaunchWork = frame > 174 && frame < 292;
  const showLaunchArtifact = frame > 232 && frame < 292;
  const showQuickPromptResponse = frame > 324;
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
    breadcrumbs: chatShotState.breadcrumbs,
    composer: {
      ...launchComposerState,
      referenceAutocomplete: frame > 96 && frame < 124
        ? {
            activeId: 'notes-current',
            query: frame > 112 ? 'notes:current' : 'notes',
            suggestions: [
              {id: 'notes-current', icon: '📝', label: 'current', typeLabel: 'note'},
              {id: 'notes-tasklist', icon: '📝', label: 'Tasklist', typeLabel: 'tasklist'},
            ],
          }
        : undefined,
      references: frame >= 124 && frame < 166
        ? [{id: 'notes-current', icon: '📝', label: 'notes:current', token: '#notes:current', typeLabel: 'note'}]
        : undefined,
      attachments: [
        ...(frame > 132 && frame < 166 ? [{
          type: 'image' as const,
          label: 'image 1',
          style: {
            opacity: imageAttachmentEnter,
            transform: `translateY(${mix(10, 0, imageAttachmentEnter)}px) scale(${mix(0.975, 1, imageAttachmentEnter)})`,
          },
        }] : []),
      ],
      bottomTabs: frame > 28
        ? {
            ...launchComposerState.bottomTabs!,
            active: frame > 246 ? 'active' : frame > 166 && frame < 210 ? 'recent' : frame > 54 ? 'active' : undefined,
            activePinned: frame > 330,
            pressed: frame > 36 && frame < 54
              ? 'new'
              : frame > 166 && frame < 184
                ? 'recent'
                : (frame > 232 && frame < 246) || (frame > 420 && frame < 438)
                  ? 'active'
                  : undefined,
            recentThreadsMenu: frame > 178 && frame < 214
              ? {
                  activeId: frame > 196 ? 'launch-dev-complete' : undefined,
                  threads: [
                    {id: 'launch-dev-complete', title: 'Launch PR implementation', meta: 'completed just now', status: 'done'},
                    {id: 'launch-plan', title: 'Launch Operating Plan', meta: 'active thread', status: 'active'},
                    {id: 'release-checks', title: 'Release checklist', meta: 'queued', status: 'next'},
                  ],
                }
              : undefined,
          }
        : undefined,
      referenceButtonPressed: frame > 96 && frame <= 108,
      quickPromptsButtonPressed: frame > 262 && frame <= 274,
      quickPromptsOpen: frame > 270 && frame < 308,
      quickPromptPressedId: frame > 284 && frame < 300 ? 'qp-write-commit' : undefined,
      sendPressed: (frame > 154 && frame < 166) || (frame > 312 && frame < 324),
      text: frame > 78 && frame < 166 ? view.prompt : frame > 292 && frame < 324 ? 'write a commit' : undefined,
    },
    conversation: {
      assistant: {
        artifact: !recentThreadLoaded && showLaunchArtifact ? launchPlanArtifact : undefined,
        markdown: showQuickPromptResponse ? view.response : recentThreadLoaded ? completedDevThreadResponse : view.response,
        toolActivity: recentThreadLoaded && !showQuickPromptResponse
          ? completedDevThreadActivityViewForFrame(frame)
          : showLaunchWork
            ? toolActivityViewForFrame(frame)
            : undefined,
      },
      createdAt: chatShotState.createdAt,
      systemMessage: chatShotState.systemMessage,
      userMessage: {
        caretVisible: frame < 166 && view.promptCaretVisible,
        text: showQuickPromptResponse ? 'write a commit' : recentThreadLoaded ? 'Polish the launch film UI and prepare the PR path.' : view.prompt,
      },
    },
    conversationStyle: {
      opacity: view.conversationOpacity,
      transform: `translateY(${view.conversationY}px)`,
    },
    messageStyles: recentThreadLoaded && !showQuickPromptResponse ? stableLoadedMessageStyles : view.messageStyles,
    cursorPath: chatShotState.cursorPath,
  };
}
