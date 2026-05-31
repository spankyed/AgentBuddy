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
import {launchFilmStory} from './launchStory';
import {filmProjects} from './paths';
import {ease, mix, textReveal, textRevealLinear} from './timeline';

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
    activeLabel: launchFilmStory.threads.checkoutImplementation.title,
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
  aside: 'Approved checkout plan - 3 tickets created',
  createdAt: '9:41 AM',
  longUser: 'Use the attached checkout notes and screenshot to turn this into a concise execution path. Cover Stripe payments, receipts, discount codes, and creator payouts.',
  marker: '3 compacted messages',
  references: {
    files: [{name: 'release-brief.md', typeLabel: 'Markdown'}],
    images: [{name: 'launch-note.png', url: launchNotePreviewUrl}],
  },
  system: 'Checkout flow implementation',
  user: 'Turn this checkout brief into tickets, notes, and a shippable PR plan.',
  commandUser: '/checkout create tickets from the current tasklist',
  queuedUser: 'Queue the deploy checklist after this plan is approved.',
  cancelledUser: 'Draft the old tutorial carousel again.',
  assistant: 'I found the checkout context and turned it into an execution plan.',
};

export const chatShotState = {
  breadcrumbs: ['Threads', launchFilmStory.threads.checkoutImplementation.title],
  createdAt: '9:41 AM',
  systemMessage: undefined,
  prompt: {text: 'Use #notes:tasklist and this screenshot to scope the checkout flow — Stripe payments, receipts, and discount codes.', from: 24, to: 214, caretUntil: 270},
  response: {text: 'I’ll scope the checkout feature from the tasklist: create the Stripe integration, wire receipt emails, add the discount engine, and prepare the creator payout stub.', from: 306, to: 346},
};

const reviewQuickPromptText = 'Conduct a thorough review of these changes for bugs and completeness, than report back with findings';

const completedDevThreadResponse = 'The checkout flow is wired. Stripe webhook handles payment_intent.succeeded, receipt emails send via Resend, and discount validation works. All three paths pass integration tests.';

const launchPlanMarkdown = `## Supafan Checkout -> Implementation Pass

### Context

The checkout thread has the current tasklist, payment requirements, and a product screenshot in one place. The next step is to turn that context into implementation work without leaving the thread.

Goal: create the implementation tickets, wire the Stripe integration, and prepare the deploy path for a shippable PR.

### Key Discovery

The existing tasklist identifies three pillars: Stripe checkout sessions (webhook-driven), receipt emails (Resend transport), and discount codes (validation middleware). A shared PaymentProvider interface keeps all three behind one dispatch surface.

### Implementation Plan

- Create implementation tickets for each checkout component.
- Design the PaymentProvider interface and session flow.
- Wire Stripe checkout.session.completed webhook handler.
- Configure Resend receipt emails with order summary template.
- Stub discount code validation endpoint.
- Run integration tests across all payment paths.

### Files

\`packages/api/src/services/checkout-service.ts\` - session creation and payment confirmation.

\`packages/api/src/webhooks/stripe-webhook.ts\` - Stripe event handling.

\`packages/api/src/services/receipt-service.ts\` - Resend email transport.`;

const completedDevThreadActivity: ToolActivityBlockState = {
  defaultOpen: false,
  entries: [
    {id: 'inspect-services', tool: 'Read', summary: 'packages/api/src/services', status: 'ok', durationMs: 420, outputSummary: 'Service directory reviewed'},
    {id: 'patch-payment', tool: 'Edit', summary: 'checkout service, Stripe webhooks, receipt emails', status: 'ok', durationMs: 1300, outputSummary: 'Payment flow wired'},
    {id: 'patch-discounts', tool: 'Edit', summary: 'discount engine and validation middleware', status: 'ok', durationMs: 1900, outputSummary: 'Discount codes ready'},
    {id: 'test-checkout', tool: 'Bash', summary: 'npm test -- --filter checkout', status: 'ok', durationMs: 8600, outputSummary: 'Integration tests passed'},
  ],
  phase: launchComposerState.phase,
  state: 'done',
};

export const chatToolActivity: ToolActivityBlockState = {
  defaultOpen: false,
  entries: [
    {id: 'read-checkout-notes', tool: 'Read', summary: 'notes/supafan/tasklist/current.md', status: 'ok', durationMs: 312, outputSummary: 'Checkout tasklist loaded'},
    {id: 'create-tickets', tool: 'Task', summary: 'create implementation tickets from checkout scope', status: 'ok', durationMs: 1280, outputSummary: '3 tickets created'},
    {id: 'write-checkout-service', tool: 'Write', summary: 'packages/api/src/services/checkout-service.ts', status: 'running'},
    {id: 'typecheck', tool: 'Bash', summary: 'npm run typecheck', status: 'running', durationMs: 5200},
  ],
  phase: launchComposerState.phase,
  state: 'streaming',
};

export const launchPlanArtifact: PlanArtifactState = {
  id: 'checkout-implementation-plan',
  title: 'Checkout Implementation Plan',
  content: {
    status: 'in-progress',
    nextStep: 'Review deploy checklist',
    notes: '### Checkout path\n- [x] Design **payment flow**\n- [x] Create tickets\n- [x] Wire Stripe integration\n- [ ] Review deploy checklist\n\n| Surface | State |\n| --- | --- |\n| Stripe | wired |\n| Receipts | wired |\n| Discounts | stubbed |\n\n> Every creator gets paid. Every buyer gets a receipt.',
    steps: [
      {id: 'design-payment-flow', title: 'Design payment flow', status: 'done'},
      {id: 'create-tickets', title: 'Create tickets', status: 'done'},
      {id: 'wire-stripe', title: 'Wire Stripe integration', status: 'done'},
      {id: 'deploy-checklist', title: 'Review deploy checklist', status: 'running'},
    ],
  },
};

export const thinkingBlockDemoState: ThinkingBlockState = {
  defaultOpen: true,
  label: 'Thinking',
  state: 'done',
  content: 'Need to preserve the checkout thread context, create a PR path, and keep the deploy blueprint as design-time automation before runtime execution.',
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
  reason: 'This matches the checkout implementation direction.',
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
  content: 'Preparing the implementation pass from the approved checkout plan. Loading the completed Stripe thread and preserving the payment context.',
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
        {id: 'tasklist', label: 'Tasklist', description: 'Edit notes, tasks, and checkout context.'},
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
  content: 'Confirm the checkout pass should keep Stripe, receipts, and discounts in one implementation thread.',
};

export const noteBlockDemoState: NoteBlockState = {
  content: 'The deploy checkout blueprint stays design-time only. Runtime work appears in logs after the command runs.',
  label: 'Checkout note',
  variant: 'warning',
};

export const markdownBlockDemoState: MarkdownBlockState = {
  content: '### Checkout checklist\n- [x] Stripe sessions\n- [x] Receipt emails\n- [ ] Review [deploy note](note://current)\n\n| Surface | Owner |\n| --- | --- |\n| code/pr | sam |\n| deploy flow | ready |\n\n```ts\nconst branch = \"sam/checkout-flow\";\n```',
  label: 'Generated summary',
};

export const togglesBlockDemoState: TogglesBlockState = {
  toggles: [
    {id: 'ship-pr', label: 'Create PR after publish', default: true},
    {id: 'notify-checkout', label: 'Notify deploy thread', description: 'Post the final checkout checklist', default: false},
  ],
};

export const sessionListBlockDemoState: SessionListBlockState = {
  sessions: [
    {id: '9f42c8a710ef', title: launchFilmStory.threads.checkoutImplementation.title, modifiedAt: '2m ago', size: 428_000},
    {id: '77bb1a4d52a0', title: launchFilmStory.threads.stripePaymentIntegration.title, modifiedAt: '18m ago', size: 214_000},
    {id: '43d0ac921eb4', title: '(untitled)', modifiedAt: '1h ago', size: 92_000},
  ],
};

export const linkBlockDemoState: LinkBlockState = {
  links: [
    {icon: 'file-text', label: 'Open checkout note'},
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
    {type: 'note', path: '/Supafan/Tasklist/current.md', tokens: 7400},
    {type: 'brief', path: '/Supafan/Payments/checkout-flow.md', tokens: 5200},
  ],
  skills: [
    {name: 'checkout-flow-fidelity', source: 'workspace', tokens: 8200},
  ],
};

export const textInputBlockDemoState: TextInputBlockState = {
  multiline: true,
  placeholder: 'Enter checkout note...',
  rows: 2,
  suggestions: ['Review checkout coverage', 'Show the PR flow'],
  value: 'Focus on the checkout work surfaces.',
};

export const filePickerBlockDemoState: FilePickerBlockState = {
  allowMultiple: true,
  fileType: 'file',
  selectedPaths: ['packages/video/src/film/state/chat.ts', 'packages/video/src/agentbuddy-ui/threads/MessageBubble.tsx'],
};

export const projectSelectBlockDemoState: ProjectSelectBlockState = {
  projects: [
    {name: 'Supafan', color: '#3b82f6', directories: [filmProjects.supafan]},
    {name: 'Acme Tools', color: '#10b981', directories: [filmProjects.launch]},
  ],
};

export const projectSelectRespondedState: ProjectSelectBlockState = {
  disabled: true,
  displayText: 'Selected project:',
  response: filmProjects.supafan,
  projects: [
    {name: 'Supafan', color: '#3b82f6', directories: [filmProjects.supafan]},
  ],
};

const planApprovalEnd = 420;
const recentThreadsClickStart = 438;
const recentThreadsClickEnd = 450;
const recentThreadsMenuStart = 462;
const recentThreadsMenuEnd = 532;
const recentThreadSelectStart = 482;
const recentThreadLoadedStart = 532;
const approvedSummaryStart = 432;
const planToolActivityStart = 444;
const quickPromptClickStart = 540;
const quickPromptClickEnd = 552;
const quickPromptMenuStart = 554;
const quickPromptMenuEnd = 594;
const quickPromptTextStart = 596;
const quickPromptSendStart = 610;
const quickPromptSendEnd = 622;
const quickPromptResponseStart = 660;
const quickPromptResponseEnd = 660;
const noteReferenceSelectStart = 112;
const noteReferenceSelectEnd = 144;
const noteReferenceInsertFrame = 152;
const promptAfterReferenceStart = 168;
const promptAfterReferenceEnd = 244;

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

function typedPromptForFrame(frame: number) {
  const prefix = 'Use #notes:';
  const insertedReferenceText = 'Use #notes:tasklist ';
  const remainingText = chatShotState.prompt.text.slice(insertedReferenceText.length);
  if (frame < noteReferenceSelectEnd) {
    return textRevealLinear(prefix, frame, chatShotState.prompt.from, noteReferenceSelectStart);
  }
  if (frame < promptAfterReferenceStart) return insertedReferenceText;
  return insertedReferenceText + textRevealLinear(remainingText, frame, promptAfterReferenceStart, promptAfterReferenceEnd);
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
    prompt: typedPromptForFrame(frame),
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
  const showInitialThinking = frame >= 282 && frame < planApprovalEnd;
  const showInitialResponse = frame >= 306 && frame < planApprovalEnd;
  const showPlan = frame >= 370 && frame < planApprovalEnd;
  const showPlanApproval = frame >= 382 && frame < planApprovalEnd;
  const showApprovedSummary = frame >= approvedSummaryStart && frame < recentThreadLoadedStart;
  const showPlanToolActivity = frame >= planToolActivityStart && frame < recentThreadLoadedStart;
  const quickPromptSent = frame > quickPromptSendEnd;
  const showQuickPromptResponse = frame > quickPromptResponseStart;
  const referenceStartIndex = 'Use '.length;
  const referenceCompleteText = 'Use #notes:tasklist ';
  const referenceTokenText = 'Use #notes:tasklist';
  const selectedNoteReference = view.prompt.startsWith(referenceCompleteText);
  const typedReferenceText = referenceTextFromPrompt(view.prompt);
  const noteReferencePromptContent: ChatComposerInlineNode[] | undefined = selectedNoteReference
    ? [
        {type: 'text', text: 'Use '},
        {type: 'reference', refId: 'notes-tasklist', label: 'Tasklist', refType: 'tasklist', shortCode: 'notes-tasklist'},
        {type: 'text', text: view.prompt.slice(referenceTokenText.length)},
      ]
    : undefined;
  const referenceAutocomplete = typedReferenceText && !selectedNoteReference
    ? typedReferenceText.startsWith('notes:')
      ? {
          anchorCharacterIndex: referenceStartIndex,
          categoryQuery: 'notes:',
          level: 'items' as const,
          query: typedReferenceText.slice('notes:'.length),
          selectedIndex: frame >= noteReferenceSelectStart ? 1 : 0,
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
    breadcrumbs: recentThreadLoaded ? ['Threads', launchFilmStory.threads.stripePaymentIntegration.title] : chatShotState.breadcrumbs,
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
            activeLabel: recentThreadLoaded ? launchFilmStory.threads.stripePaymentIntegration.title : launchComposerState.bottomTabs!.activeLabel,
            active: frame >= recentThreadLoadedStart ? 'active' : frame > recentThreadsClickStart && frame < recentThreadLoadedStart ? 'recent' : frame > 150 ? 'active' : undefined,
            pressed: frame > recentThreadsClickStart && frame < recentThreadsClickEnd
                ? 'recent'
                : (frame > recentThreadSelectStart && frame < recentThreadLoadedStart) || (frame > quickPromptSendStart && frame < quickPromptSendEnd)
                  ? 'active'
                  : undefined,
            recentThreadsMenu: frame > recentThreadsMenuStart && frame < recentThreadsMenuEnd
              ? {
                  currentId: launchFilmStory.threads.checkoutImplementation.id,
                  selectedIndex: frame > recentThreadSelectStart ? 0 : -1,
                  threadStates: {
                    [launchFilmStory.threads.stripePaymentIntegration.id]: {color: '#22c55e'},
                    [launchFilmStory.threads.checkoutImplementation.id]: {busy: true},
                    [launchFilmStory.threads.deployChecklist.id]: {color: '#f59e0b'},
                  },
                  threads: [
                    {id: launchFilmStory.threads.stripePaymentIntegration.id, topic: launchFilmStory.threads.stripePaymentIntegration.title, pinned: true, shortCode: launchFilmStory.threads.stripePaymentIntegration.shortCode, timestamp: recentThreadTimestamps.now},
                    {id: launchFilmStory.threads.checkoutImplementation.id, topic: launchFilmStory.threads.checkoutImplementation.title, shortCode: launchFilmStory.threads.checkoutImplementation.shortCode, timestamp: recentThreadTimestamps.twoMinutesAgo},
                    {id: launchFilmStory.threads.deployChecklist.id, topic: launchFilmStory.threads.deployChecklist.title, shortCode: launchFilmStory.threads.deployChecklist.shortCode, timestamp: recentThreadTimestamps.eightMinutesAgo},
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
          markdown: 'Approved checkout implementation plan - work started',
          style: {
            opacity: ease(frame, approvedSummaryStart, approvedSummaryStart + 10),
            transform: `translateY(${(1 - ease(frame, approvedSummaryStart, approvedSummaryStart + 10)) * 12}px)`,
          },
        }] : []),
        ...(showPlanToolActivity ? [{
          markdown: '',
          style: {
            opacity: ease(frame, planToolActivityStart, planToolActivityStart + 14),
            transform: `translateY(${(1 - ease(frame, planToolActivityStart, planToolActivityStart + 14)) * 18}px)`,
          },
          toolActivity: {
            rowOpacities: chatToolActivity.entries.map((_, index) => ease(frame, planToolActivityStart + 2 + index * 8, planToolActivityStart + 14 + index * 8)),
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
          content: 'Examining the tasklist and screenshot to identify the checkout components and determine the right Stripe integration pattern before creating tickets.',
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
        text: quickPromptSent ? reviewQuickPromptText : recentThreadLoaded ? 'Polish the checkout flow and prepare the PR path.' : view.prompt,
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
