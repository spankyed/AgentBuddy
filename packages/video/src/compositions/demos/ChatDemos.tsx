import {useCurrentFrame} from 'remotion';
import {ChatComposer} from '../../agentbuddy-ui/chat/ChatComposer';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {ActionButtonsBlock} from '../../agentbuddy-ui/threads/ActionButtonsBlock';
import {ApprovalBlock} from '../../agentbuddy-ui/threads/ApprovalBlock';
import {ButtonGroupBlock} from '../../agentbuddy-ui/threads/ButtonGroupBlock';
import {ChoiceBlock} from '../../agentbuddy-ui/threads/ChoiceBlock';
import {ContextUsageBlock} from '../../agentbuddy-ui/threads/ContextUsageBlock';
import {FilePickerBlock} from '../../agentbuddy-ui/threads/FilePickerBlock';
import {LinkBlock} from '../../agentbuddy-ui/threads/LinkBlock';
import {MarkdownBlock} from '../../agentbuddy-ui/threads/MarkdownBlock';
import {MarkdownViewer} from '../../agentbuddy-ui/threads/MarkdownViewer';
import {MessageBubble} from '../../agentbuddy-ui/threads/MessageBubble';
import {NoteBlock} from '../../agentbuddy-ui/threads/NoteBlock';
import {PlanArtifactCard} from '../../agentbuddy-ui/threads/PlanArtifactCard';
import {PromptBlock} from '../../agentbuddy-ui/threads/PromptBlock';
import {ProjectSelectBlock} from '../../agentbuddy-ui/threads/ProjectSelectBlock';
import {QuestionBlock} from '../../agentbuddy-ui/threads/QuestionBlock';
import {SessionListBlock} from '../../agentbuddy-ui/threads/SessionListBlock';
import {TextInputBlock} from '../../agentbuddy-ui/threads/TextInputBlock';
import {ThinkingBlock} from '../../agentbuddy-ui/threads/ThinkingBlock';
import {TogglesBlock} from '../../agentbuddy-ui/threads/TogglesBlock';
import {ToolActivityBlock} from '../../agentbuddy-ui/threads/ToolActivityBlock';
import {ToolInputBlock} from '../../agentbuddy-ui/threads/ToolInputBlock';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {REFERENCE_CATEGORIES} from '../../agentbuddy-ui/chat/referenceConfig';
import {ChatShot} from '../../film/shots/ChatShot';
import {
  actionButtonsBlockDemoState,
  actionButtonsDisabledDemoState,
  launchComposerState,
  launchComposerWithAttachmentState,
  launchComposerModeMenuState,
  launchComposerPhaseMenuState,
  launchPlanArtifact,
  approvalBlockDemoState,
  approvalBlockRespondedState,
  buttonGroupBlockDemoState,
  buttonGroupRespondedState,
  choiceBlockDemoState,
  choiceBlockRespondedState,
  contextUsageBlockDemoState,
  filePickerBlockDemoState,
  linkBlockDemoState,
  markdownBlockDemoState,
  messageBubbleDemoState,
  noteBlockDemoState,
  promptBlockDemoState,
  projectSelectBlockDemoState,
  projectSelectRespondedState,
  questionBlockDemoState,
  questionBlockRespondedState,
  sessionListBlockDemoState,
  textInputBlockDemoState,
  toolInputBashDemoState,
  thinkingBlockDemoState,
  togglesBlockDemoState,
  toolInputJsonDemoState,
  toolInputBlockDemoState,
  toolInputWriteDemoState,
  toolActivityViewForFrame,
} from '../../film/state/chat';
import {filmProjectDirectories} from '../../film/state/paths';
import {DemoBottomSlot, DemoSlot, DemoStack} from '../DemoLayout';

const launchPreviewUrl = new URL('../../../../../resources/draft-final.png', import.meta.url).toString();
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
const referenceDemoPopupPosition = {
  bottom: 220,
  left: 200,
};
const referenceDemoUpperPopupPosition = {
  bottom: 432,
  left: 200,
};
const commandDemoPopupPosition = {
  bottom: 214,
  left: 160,
};
const recentThreadsDemoPopupPosition = {
  bottom: 214,
  left: 144,
  width: 1152,
};
const newThreadDemoPopupPosition = {
  bottom: 214,
  left: 1112,
  top: 604,
};
type ReferenceAutocompleteDemoState = NonNullable<ChatComposerState['referenceAutocomplete']>;

function referenceAutocompleteDemoState<T extends ReferenceAutocompleteDemoState>(
  state: T,
  slot: 'lower' | 'upper' = 'lower',
): T {
  return {
    ...state,
    popupPosition: slot === 'upper' ? referenceDemoUpperPopupPosition : referenceDemoPopupPosition,
  };
}

export const ChatComposerDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={launchComposerState} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerWithAttachmentDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={launchComposerWithAttachmentState} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerMixedAttachmentsDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          attachments: [
            {
              type: 'file',
              label: 'release-brief.md',
              typeLabel: 'Document',
            },
            {
              type: 'image',
              label: 'launch-plan.png',
              previewUrl: launchPreviewUrl,
            },
          ],
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerStatusLineDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={{...launchComposerState, chatStatus: {color: '#10b981'}, statusLine: filmProjectDirectories.agentBuddy.displayPath}} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerQuickPromptsEditingDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          quickPromptsEditing: true,
          quickPromptsEditingId: 'qp-create-ticket',
          quickPromptsEditingText: 'create the next thread from this plan',
          quickPromptsNewText: 'summarize the PR launch notes',
          quickPromptsOpen: true,
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerRevertHistoryDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          revertHistory: {
            messages: [
              {id: 'm1', text: 'Turn the launch notes into a plan and create execution tickets.', createdAt: '9:32 AM', canSummarize: false},
              {id: 'm2', text: 'Use the screenshot and current tasklist to write a launch brief.', createdAt: '9:41 AM', canSummarize: true},
              {id: 'm3', text: 'Polish the checkout flow and prepare the PR path.', createdAt: '9:58 AM', canSummarize: true, selected: true},
            ],
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerRevertActionsDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          revertHistory: {
            level: 'actions',
            messages: [
              {id: 'm1', text: 'Turn the launch notes into a plan and create execution tickets.', createdAt: '9:32 AM', canSummarize: false},
            ],
            selectedAction: 'summarize-from-here',
            selectedMessageId: 'm1',
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerModeMenuDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={launchComposerModeMenuState} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerPhaseMenuDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer state={launchComposerPhaseMenuState} />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerInputStatesDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 0, right: 0, bottom: 580}}>
      <ChatComposer state={{...launchComposerState, commandActive: true, text: '/launch-film'}} />
    </DemoSlot>
    <DemoSlot style={{left: 0, right: 0, bottom: 330}}>
      <ChatComposer state={{...launchComposerState, dropActive: true, attachments: [{type: 'file', label: 'release-brief.md'}]}} />
    </DemoSlot>
    <DemoSlot style={{left: 0, right: 0, bottom: 80}}>
      <ChatComposer state={{...launchComposerState, busy: true, recording: true}} />
    </DemoSlot>
  </SurfaceFrame>
);

export const ChatComposerCommandSuggestionDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          commandActive: true,
          commandSuggestion: {
            activeIndex: 1,
            anchorCharacterIndex: 1,
            popupPosition: commandDemoPopupPosition,
            query: 'la',
            suggestions: [
              {name: 'launch-film'},
              {name: 'launch-plan'},
              {name: 'load-context'},
            ],
          },
          text: '/la',
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerCommandSuggestionEmptyDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          commandActive: true,
          commandSuggestion: {
            anchorCharacterIndex: 1,
            popupPosition: commandDemoPopupPosition,
            query: 'zz',
            suggestions: [],
          },
          text: '/zz',
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerReferenceCategoriesDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: '',
            level: 'category',
            query: '',
            selectedIndex: 2,
            selectedCategory: null,
            suggestions: referenceCategorySuggestions(),
          }),
          text: 'Use #',
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerReferenceFilteredCategoriesDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: '',
            level: 'category',
            query: 'no',
            selectedCategory: null,
            suggestions: referenceCategorySuggestions('no'),
          }),
          text: 'Use #no',
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerReferencesDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: 'notes:',
            level: 'items',
            query: 'current',
            selectedCategory: 'notes',
            suggestions: [
              {id: 'notes-current', label: 'current', shortCode: 'notes-current', type: 'note'},
              {id: 'notes-tasklist', label: 'Tasklist', shortCode: 'notes-tasklist', type: 'tasklist'},
            ],
          }),
          content: [
            {type: 'text', text: 'Use '},
            {type: 'reference', refId: 'notes-current', label: 'current', refType: 'note', shortCode: 'notes-current'},
            {type: 'text', text: ' and this screenshot to turn launch context into tickets.'},
          ],
          text: 'Use current and this screenshot to turn launch context into tickets.',
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerReferenceItemTypesDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 0, right: 0, bottom: 292}}>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: 'threads:',
            level: 'items',
            query: 'launch',
            selectedCategory: 'threads',
            suggestions: [
              {id: 'thread-launch', label: 'Launch PR implementation', shortCode: 'AB-104', type: 'thread'},
              {id: 'thread-checkout', label: 'Polish checkout UI', shortCode: 'AB-123', type: 'thread'},
            ],
          }, 'upper'),
          text: 'Use #threads:launch',
        }}
      />
    </DemoSlot>
    <DemoSlot style={{left: 0, right: 0, bottom: 80}}>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: 'library:',
            level: 'items',
            query: 'launch',
            selectedCategory: 'documents',
            suggestions: [
              {id: 'doc-release', label: 'Release brief', shortCode: 'release-brief', type: 'document'},
              {id: 'folder-assets', label: 'Launch assets', shortCode: 'launch-assets', type: 'folder'},
            ],
          }),
          text: 'Use #library:launch',
        }}
      />
    </DemoSlot>
  </SurfaceFrame>
);

export const ChatComposerReferencePillsDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          content: [
            {type: 'text', text: 'Use '},
            {type: 'reference', refId: 'thread-launch', label: 'Launch PR implementation', refType: 'thread', shortCode: 'launch-pr'},
            {type: 'text', text: ' '},
            {type: 'reference', refId: 'doc-brief', label: 'Release brief', refType: 'document', shortCode: 'brief'},
            {type: 'text', text: ' '},
            {type: 'reference', refId: 'folder-assets', label: 'Launch assets', refType: 'folder', shortCode: 'assets'},
            {type: 'text', text: ' '},
            {type: 'reference', refId: 'note-current', label: 'current', refType: 'note', shortCode: 'notes-current'},
            {type: 'text', text: ' '},
            {type: 'reference', refId: 'task-copy', label: 'Write launch copy', refType: 'task', shortCode: 'copy'},
            {type: 'text', text: ' '},
            {type: 'reference', refId: 'tasklist-root', label: 'Tasklist', refType: 'tasklist', shortCode: 'notes-tasklist'},
          ],
          text: 'Use Launch PR implementation Release brief Launch assets current Write launch copy Tasklist',
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerReferenceEmptyStatesDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 0, right: 0, bottom: 292}}>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: '',
            level: 'category',
            query: 'zzz',
            selectedCategory: null,
            suggestions: [],
          }, 'upper'),
          text: 'Use #zzz',
        }}
      />
    </DemoSlot>
    <DemoSlot style={{left: 0, right: 0, bottom: 80}}>
      <ChatComposer
        state={{
          ...launchComposerState,
          referenceAutocomplete: referenceAutocompleteDemoState({
            anchorCharacterIndex: 4,
            categoryQuery: 'notes:',
            level: 'items',
            query: 'zzz',
            selectedCategory: 'notes',
            suggestions: [],
          }),
          text: 'Use #notes:zzz',
        }}
      />
    </DemoSlot>
  </SurfaceFrame>
);

export const ChatComposerRecentThreadsDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          bottomTabs: {
            active: 'recent',
            activeLabel: 'Supafan checkout flow',
            pressed: 'recent',
            recentThreadsMenu: {
              currentId: 'launch-plan',
              popupPosition: recentThreadsDemoPopupPosition,
              selectedIndex: 0,
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
            },
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerRecentThreadsEmptyDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          bottomTabs: {
            active: 'recent',
            activeLabel: 'Supafan checkout flow',
            pressed: 'recent',
            recentThreadsMenu: {
              popupPosition: recentThreadsDemoPopupPosition,
              threads: [],
            },
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerRecentThreadsRenameDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          bottomTabs: {
            active: 'recent',
            activeLabel: 'Supafan checkout flow',
            pressed: 'recent',
            recentThreadsMenu: {
              contextMenu: {
                threadId: 'launch-plan',
              },
              currentId: 'launch-plan',
              editingName: 'Launch Operating Plan',
              editingThreadId: 'launch-plan',
              popupPosition: recentThreadsDemoPopupPosition,
              selectedIndex: 0,
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
            },
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerActiveThreadRenameDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          bottomTabs: {
            active: 'active',
            activeEditing: true,
            activeLabel: 'Supafan checkout flow',
            pressed: 'active',
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerNewThreadProjectMenuDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          bottomTabs: {
            active: 'new',
            activeLabel: 'Supafan checkout flow',
            newThreadMenu: {
              openSubmenu: 'project',
              popupPosition: newThreadDemoPopupPosition,
              projects: [
                {name: 'Supafan', color: '#38bdf8', directories: [filmProjectDirectories.supafan.path]},
                {name: 'Supafan main', color: '#a78bfa', directories: [`${filmProjectDirectories.supafan.path}-main`]},
              ],
              threads: [],
            },
            pressed: 'new',
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ChatComposerNewThreadChildMenuDemo = () => (
  <SurfaceFrame>
    <DemoBottomSlot>
      <ChatComposer
        state={{
          ...launchComposerState,
          bottomTabs: {
            active: 'new',
            activeLabel: 'Supafan checkout flow',
            newThreadMenu: {
              openSubmenu: 'child',
              popupPosition: newThreadDemoPopupPosition,
              projects: [],
              threads: [
                {id: 'launch-plan', shortCode: 'AB-104', timestamp: recentThreadTimestamps.now, topic: 'Launch Operating Plan'},
                {id: 'release-checks', shortCode: 'AB-118', timestamp: recentThreadTimestamps.twoMinutesAgo, topic: 'Release checklist'},
                {id: 'checkout-polish', shortCode: 'AB-123', timestamp: recentThreadTimestamps.eightMinutesAgo, topic: 'Polish checkout UI'},
              ],
            },
            pressed: 'new',
          },
        }}
      />
    </DemoBottomSlot>
  </SurfaceFrame>
);

export const ToolActivityDemo = () => {
  const frame = useCurrentFrame();
  const view = toolActivityViewForFrame(frame);
  return (
    <SurfaceFrame>
      <DemoSlot style={{left: 240, top: 112, width: 620}}>
        <ToolActivityBlock rowOpacities={view.rowOpacities} state={view.state} />
      </DemoSlot>
      <DemoSlot style={{right: 240, bottom: 120, width: 520}}>
        <PlanArtifactCard artifact={launchPlanArtifact} />
      </DemoSlot>
    </SurfaceFrame>
  );
};

export const InteractionBlocksDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 160, top: 54, width: 600}}>
      <DemoStack gap={12}>
        <ThinkingBlock state={thinkingBlockDemoState} />
        <ToolInputBlock state={toolInputBlockDemoState} />
        <ToolInputBlock state={toolInputWriteDemoState} />
        <ToolInputBlock state={toolInputBashDemoState} />
        <ToolInputBlock state={toolInputJsonDemoState} />
        <ApprovalBlock state={approvalBlockDemoState} />
        <ActionButtonsBlock state={actionButtonsBlockDemoState} />
        <ActionButtonsBlock state={actionButtonsDisabledDemoState} />
        <TogglesBlock state={togglesBlockDemoState} />
        <TextInputBlock state={textInputBlockDemoState} />
        <FilePickerBlock state={filePickerBlockDemoState} />
        <ContextUsageBlock state={contextUsageBlockDemoState} />
      </DemoStack>
    </DemoSlot>
    <DemoSlot style={{right: 160, top: 54, width: 460}}>
      <DemoStack gap={12}>
        <PromptBlock state={promptBlockDemoState} />
        <NoteBlock state={noteBlockDemoState} />
        <MarkdownBlock state={markdownBlockDemoState} />
        <LinkBlock state={linkBlockDemoState} />
        <ChoiceBlock state={choiceBlockDemoState} />
        <QuestionBlock state={questionBlockDemoState} />
        <ButtonGroupBlock state={buttonGroupBlockDemoState} />
        <ProjectSelectBlock state={projectSelectBlockDemoState} />
        <ApprovalBlock state={approvalBlockRespondedState} />
        <ChoiceBlock state={choiceBlockRespondedState} />
        <QuestionBlock state={questionBlockRespondedState} />
        <ButtonGroupBlock state={buttonGroupRespondedState} />
        <ProjectSelectBlock state={projectSelectRespondedState} />
        <SessionListBlock state={sessionListBlockDemoState} />
      </DemoStack>
    </DemoSlot>
  </SurfaceFrame>
);

export const ToolInputBlocksDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 220, top: 72, width: 700}}>
      <DemoStack>
        <ThinkingBlock state={thinkingBlockDemoState} />
        <ToolInputBlock state={toolInputBlockDemoState} />
        <ToolInputBlock state={toolInputWriteDemoState} />
        <ToolInputBlock state={toolInputBashDemoState} />
        <ToolInputBlock state={toolInputJsonDemoState} />
      </DemoStack>
    </DemoSlot>
  </SurfaceFrame>
);

export const InteractionControlsDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 220, top: 72, width: 560}}>
      <DemoStack>
        <ApprovalBlock state={approvalBlockDemoState} />
        <ApprovalBlock state={approvalBlockRespondedState} />
        <ActionButtonsBlock state={actionButtonsBlockDemoState} />
        <ActionButtonsBlock state={actionButtonsDisabledDemoState} />
        <ChoiceBlock state={choiceBlockDemoState} />
        <ChoiceBlock state={choiceBlockRespondedState} />
      </DemoStack>
    </DemoSlot>
    <DemoSlot style={{right: 220, top: 72, width: 520}}>
      <DemoStack>
        <QuestionBlock state={questionBlockDemoState} />
        <QuestionBlock state={questionBlockRespondedState} />
        <ButtonGroupBlock state={buttonGroupBlockDemoState} />
        <ButtonGroupBlock state={buttonGroupRespondedState} />
        <TextInputBlock state={textInputBlockDemoState} />
        <FilePickerBlock state={filePickerBlockDemoState} />
        <ProjectSelectBlock state={projectSelectBlockDemoState} />
        <ProjectSelectBlock state={projectSelectRespondedState} />
      </DemoStack>
    </DemoSlot>
  </SurfaceFrame>
);

export const ContentBlocksDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 220, top: 72, width: 580}}>
      <DemoStack>
        <PromptBlock state={promptBlockDemoState} />
        <NoteBlock state={noteBlockDemoState} />
        <MarkdownBlock state={markdownBlockDemoState} />
        <LinkBlock state={linkBlockDemoState} />
      </DemoStack>
    </DemoSlot>
    <DemoSlot style={{right: 220, top: 72, width: 520}}>
      <DemoStack>
        <TogglesBlock state={togglesBlockDemoState} />
        <SessionListBlock state={sessionListBlockDemoState} />
        <ContextUsageBlock state={contextUsageBlockDemoState} />
      </DemoStack>
    </DemoSlot>
  </SurfaceFrame>
);

export const FullMarkdownViewerDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 320, top: 120, width: 640}}>
      <MarkdownViewer
        content={[
          '# Launch notes',
          '',
          'Open [Tasklist](tasklist://tasklist-current) and attach it to [Launch PR implementation](thread://launch-pr).',
          '',
          '- [x] Capture launch context',
          '- [ ] Ship release automation',
          '',
          '```ts',
          'const surface = "Supafan";',
          '```',
        ].join('\n')}
        variant="full"
      />
    </DemoSlot>
  </SurfaceFrame>
);

export const PlanArtifactDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 320, right: 320, top: 128, bottom: 128}}>
      <PlanArtifactCard artifact={launchPlanArtifact} />
    </DemoSlot>
  </SurfaceFrame>
);

export const MessageBubbleDemo = () => (
  <SurfaceFrame>
    <DemoSlot style={{left: 220, right: 220, top: 104}}>
      <MessageBubble sender="system">{messageBubbleDemoState.system}</MessageBubble>
      <MessageBubble sender="marker">{messageBubbleDemoState.marker}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt}>{messageBubbleDemoState.user}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} isCommand>{messageBubbleDemoState.commandUser}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} references={messageBubbleDemoState.references} truncated>{messageBubbleDemoState.longUser}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} references={messageBubbleDemoState.references} expanded truncated>{messageBubbleDemoState.longUser}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} isTail status="queued">{messageBubbleDemoState.queuedUser}</MessageBubble>
      <MessageBubble sender="user" createdAt={messageBubbleDemoState.createdAt} isTail status="cancelled">{messageBubbleDemoState.cancelledUser}</MessageBubble>
      <MessageBubble sender="assistant" autoHide>{messageBubbleDemoState.aside}</MessageBubble>
      <MessageBubble sender="assistant" autoHide expanded>{messageBubbleDemoState.aside}</MessageBubble>
      <MessageBubble sender="assistant" createdAt={messageBubbleDemoState.createdAt}>{messageBubbleDemoState.assistant}</MessageBubble>
      <MessageBubble sender="assistant" createdAt={messageBubbleDemoState.createdAt} forkable={false}>{messageBubbleDemoState.assistant}</MessageBubble>
    </DemoSlot>
  </SurfaceFrame>
);

export const ChatSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <ChatShot frame={frame} />
    </SurfaceFrame>
  );
};
