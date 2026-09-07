import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { standardBlocks } from './register';

import PromptBlock from './display/PromptBlock.vue';
import NoteBlock from './display/NoteBlock.vue';
import MarkdownBlock from './display/MarkdownBlock.vue';
import ActionButtons from './display/ActionButtons.vue';
import LinkBlock from './display/LinkBlock.vue';
import ToolActivityBlock from './display/ToolActivityBlock.vue';
import ThinkingBlock from './display/ThinkingBlock.vue';
import ToolInputBlock from './display/ToolInputBlock.vue';
import TogglesBlock from './display/TogglesBlock.vue';
import ContextUsageBlock from './display/ContextUsageBlock.vue';
import SessionListBlock from './display/SessionListBlock.vue';
import FilePickerInput from './input/FilePickerInput.vue';
import ChoiceInput from './input/ChoiceInput.vue';
import QuestionInput from './input/QuestionInput.vue';
import TextInput from './input/TextInput.vue';
import ApprovalButtons from './input/ApprovalButtons.vue';
import ButtonGroupInput from './input/ButtonGroupInput.vue';
import ProjectSelectInput from './input/ProjectSelectInput.vue';

const componentMap: Record<string, unknown> = {
  'prompt': PromptBlock,
  'note': NoteBlock,
  'markdown': MarkdownBlock,
  'actions': ActionButtons,
  'link': LinkBlock,
  'tool-activity': ToolActivityBlock,
  'thinking': ThinkingBlock,
  'tool-input': ToolInputBlock,
  'toggles': TogglesBlock,
  'context-usage': ContextUsageBlock,
  'session-list': SessionListBlock,
  'file-picker': FilePickerInput,
  'choice': ChoiceInput,
  'question': QuestionInput,
  'text': TextInput,
  'approval': ApprovalButtons,
  'button-group': ButtonGroupInput,
  'project-select': ProjectSelectInput,
};

export const blockDefinitions: BlockDefinition[] = standardBlocks.map(def => ({
  ...def,
  fe: componentMap[def.type] ? { component: componentMap[def.type] } : undefined,
}));
