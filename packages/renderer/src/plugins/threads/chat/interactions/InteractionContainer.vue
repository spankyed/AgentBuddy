<template>
  <div class="interaction-container mt-3 space-y-3">
    <template v-for="(block, index) in blocks" :key="index">
      <!-- Prompt Block -->
      <PromptBlock
        v-if="block.type === 'prompt'"
        :content="(block.props as any).content"
      />

      <!-- Note Block -->
      <NoteBlock
        v-else-if="block.type === 'note'"
        :content="(block.props as any).content"
        :variant="(block.props as any).variant"
        :label="(block.props as any).label"
      />

      <!-- Markdown Block -->
      <MarkdownBlock
        v-else-if="block.type === 'markdown'"
        :content="(block.props as any).content"
        :label="(block.props as any).label"
      />

      <!-- File Picker Input -->
      <FilePickerInput
        v-else-if="block.type === 'file-picker'"
        :file-type="(block.props as any).fileType"
        :allow-multiple="(block.props as any).allowMultiple"
        :model-value="(block.props as any).modelValue"
        :disabled="isDisabled"
        :response="responseForBlock('file-picker')"
        :display-text="(block.props as any).displayText"
        @submit="submitFilePicker"
        @cancel="handleCancel"
      />

      <!-- Choice Input -->
      <ChoiceInput
        v-else-if="block.type === 'choice'"
        :choices="(block.props as any).choices"
        :multi-select="(block.props as any).multiSelect"
        :allow-custom="(block.props as any).allowCustom"
        :compact="(block.props as any).compact"
        :model-value="(block.props as any).modelValue"
        :skip-option="(block.props as any).skipOption"
        :disabled="isDisabled"
        :response="responseForBlock('choice')"
        :display-text="(block.props as any).displayText"
        @submit="submitChoice"
        @cancel="handleCancel"
      />

      <!-- Question Input (single or multi-question wizard) -->
      <QuestionInput
        v-else-if="block.type === 'question'"
        :questions="(block.props as any).questions"
        :disabled="isDisabled"
        :response="responseForBlock('question')"
        @submit="submitQuestion"
        @cancel="handleCancel"
      />

      <!-- Text Input -->
      <TextInput
        v-else-if="block.type === 'text'"
        :placeholder="(block.props as any).placeholder"
        :multiline="(block.props as any).multiline"
        :required="(block.props as any).required"
        :suggestions="(block.props as any).suggestions"
        :model-value="(block.props as any).modelValue"
        :disabled="isDisabled"
        :response="responseForBlock('text')"
        :display-text="(block.props as any).displayText"
        @submit="submitText"
        @cancel="handleCancel"
      />

      <!-- Approval Buttons -->
      <ApprovalButtons
        v-else-if="block.type === 'approval'"
        :require-reason="(block.props as any).requireReason"
        :allow-reason="(block.props as any).allowReason"
        :reason-placeholder="(block.props as any).reasonPlaceholder"
        :model-value="(block.props as any).modelValue"
        :auto-accept-option="(block.props as any).autoAcceptOption"
        :options="(block.props as any).options"
        :disabled="isDisabled"
        :response="responseForBlock('approval')"
        @approve="handleApprove"
        @deny="handleDeny"
      />

      <!-- Custom Action Buttons (if needed for advanced cases) -->
      <ActionButtons
        v-else-if="block.type === 'actions'"
        :buttons="(block.props as any).buttons"
        :submit-disabled="(block.props as any).submitDisabled || isDisabled"
        :submit-variant="(block.props as any).submitVariant"
        @submit="() => submitActions(undefined)"
        @cancel="handleCancel"
      />

      <!-- Link Block -->
      <LinkBlock
        v-else-if="block.type === 'link'"
        :links="(block.props as any).links"
        @navigate="handleNavigate"
      />

      <!-- Button Group Input -->
      <ButtonGroupInput
        v-else-if="block.type === 'button-group'"
        :buttons="(block.props as any).buttons"
        :keep-interactive="(block.props as any).keepInteractive"
        :disabled="isDisabled"
        :response="responseForBlock('button-group')"
        :display-text="(block.props as any).displayText"
        @submit="submitButtonGroup"
      />

      <!-- Project Select Input -->
      <ProjectSelectInput
        v-else-if="block.type === 'project-select'"
        :projects="(block.props as any).projects"
        :disabled="isDisabled"
        :response="responseForBlock('project-select')"
        :display-text="(block.props as any).displayText"
        @submit="submitProjectSelect"
      />

      <!-- Toggles Block -->
      <TogglesBlock
        v-else-if="block.type === 'toggles'"
        ref="togglesBlockRef"
        :toggles="(block.props as any).toggles"
        :disabled="isDisabled"
        :response="responseForBlock('toggles')"
      />

      <!-- Tool Input Block — structured display for tool approval context -->
      <ToolInputBlock
        v-else-if="block.type === 'tool-input'"
        :tool-name="(block.props as any).toolName"
        :input="(block.props as any).input"
      />

      <!-- Tool Activity Block — collapsible group of Claude Code tool calls -->
      <ToolActivityBlock
        v-else-if="block.type === 'tool-activity'"
        :entries="(block.props as any).entries"
        :label="(block.props as any).label"
        :state="(block.props as any).state"
        :default-open="(block.props as any).defaultOpen"
        :artifact-ref="(block.props as any).artifactRef"
        :phase="(block.props as any).phase"
      />

      <!-- Thinking Block — collapsible extended thinking content -->
      <ThinkingBlock
        v-else-if="block.type === 'thinking'"
        :content="(block.props as any).content"
        :label="(block.props as any).label"
        :state="(block.props as any).state"
        :default-open="(block.props as any).defaultOpen"
      />

      <!-- Context Usage Block — styled token breakdown from /cc-context -->
      <ContextUsageBlock
        v-else-if="block.type === 'context-usage'"
        :data="(block.props as any).data"
      />

      <!-- Session List Block — styled session listing from /cc-sessions -->
      <SessionListBlock
        v-else-if="block.type === 'session-list'"
        :sessions="(block.props as any).sessions"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { BlockConfig } from '@app/api'
import PromptBlock from './blocks/PromptBlock.vue'
import NoteBlock from './blocks/NoteBlock.vue'
import MarkdownBlock from './blocks/MarkdownBlock.vue'
import ActionButtons from './blocks/ActionButtons.vue'
import LinkBlock, { type Link } from './blocks/LinkBlock.vue'
import ToolActivityBlock from './blocks/ToolActivityBlock.vue'
import ThinkingBlock from './blocks/ThinkingBlock.vue'
import ToolInputBlock from './blocks/ToolInputBlock.vue'
import FilePickerInput from './inputs/FilePickerInput.vue'
import ChoiceInput from './inputs/ChoiceInput.vue'
import QuestionInput from './inputs/QuestionInput.vue'
import TextInput from './inputs/TextInput.vue'
import ApprovalButtons from './inputs/ApprovalButtons.vue'
import ButtonGroupInput from './inputs/ButtonGroupInput.vue'
import ProjectSelectInput from './inputs/ProjectSelectInput.vue'
import TogglesBlock from './blocks/TogglesBlock.vue'
import ContextUsageBlock from './blocks/ContextUsageBlock.vue'
import SessionListBlock from './blocks/SessionListBlock.vue'
import { ref, computed } from 'vue'
import { applicationState } from '@/main'
import { navigateToPlugin } from '@/core/utils/navigate'
import { id as threadsId } from '@/plugins/threads/state'

interface Props {
  blocks: BlockConfig[]
  messageId: string
  isDisabled?: boolean
  response?: any
}

const props = withDefaults(defineProps<Props>(), {
  isDisabled: false
})

const threadsActor = applicationState.system.get(threadsId)

const togglesBlockRef = ref<InstanceType<typeof TogglesBlock> | null>(null)

// ─── Per-block response routing ───────────────────────────────────────
// Infer which block type submitted the response from its shape, so only
// that block renders the "responded" state — others just disable/hide.
const respondedBlockType = computed(() => {
  const r = props.response
  if (!r) return null
  // Explicit source tag (set by handleSubmitFrom when toggles wrap the response)
  if (typeof r === 'object' && r._source) return r._source
  // Fallback heuristic for legacy/untagged responses
  if (typeof r === 'string') return 'project-select'
  if (r.path) return 'file-picker'
  if (r.approved !== undefined || r.cancelled) return 'approval'
  if (Array.isArray(r)) return 'choice'
  return null // unknown — pass response to all (backward compat)
})

const responseForBlock = (blockType: string) => {
  if (!props.isDisabled || !props.response) return props.response
  if (!respondedBlockType.value) return props.response
  return blockType === respondedBlockType.value ? props.response : null
}

// Internal interaction handlers
const handleBlockResponse = (response: any) => {
  threadsActor.send({
    type: 'RESPOND_TO_BLOCK_INTERACTION',
    messageId: props.messageId,
    response
  })
}

// Event handlers — wraps toggle values and source tag into the response.
const handleSubmitFrom = (blockType: string) => (response: any) => {
  const toggles = togglesBlockRef.value?.values
  if (toggles && Object.keys(toggles).length > 0) {
    handleBlockResponse({ path: response, toggles: { ...toggles }, _source: blockType })
  } else {
    handleBlockResponse(response)
  }
}

// Pre-create stable handler refs so Vue event binding works across renders.
// Inline handleSubmitFrom('...') in templates creates a new closure on every
// render, breaking Vue 3's event delegation.
const submitFilePicker = handleSubmitFrom('file-picker')
const submitChoice = handleSubmitFrom('choice')
const submitQuestion = handleSubmitFrom('question')
const submitText = handleSubmitFrom('text')
const submitActions = handleSubmitFrom('actions')
const submitButtonGroup = handleSubmitFrom('button-group')
const submitProjectSelect = handleSubmitFrom('project-select')

const handleApprove = (reason?: string, flags?: Record<string, any>) => {
  handleBlockResponse({ approved: true, reason, ...flags })
}

const handleDeny = (reason?: string) => {
  handleBlockResponse({ approved: false, reason })
}

const handleCancel = () => {
  // Send cancelled response to backend
  handleBlockResponse({ cancelled: true })
}

const handleNavigate = (link: Link) => {
  const { target, data } = link.event

  if (target === 'application') {
    // Send event to application state machine
    applicationState.send(data)
  } else if (target === 'external') {
    // Open external URL in default browser
    window.open(data.url, '_blank')
  } else {
    // target is a plugin name - activate it and send the event
    navigateToPlugin(target, data)
  }
}
</script>
