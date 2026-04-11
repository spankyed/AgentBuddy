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

      <!-- File Picker Input -->
      <FilePickerInput
        v-else-if="block.type === 'file-picker'"
        :file-type="(block.props as any).fileType"
        :allow-multiple="(block.props as any).allowMultiple"
        :model-value="(block.props as any).modelValue"
        :disabled="isDisabled"
        :response="response"
        :display-text="(block.props as any).displayText"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />

      <!-- Choice Input -->
      <ChoiceInput
        v-else-if="block.type === 'choice'"
        :choices="(block.props as any).choices"
        :multi-select="(block.props as any).multiSelect"
        :allow-custom="(block.props as any).allowCustom"
        :model-value="(block.props as any).modelValue"
        :disabled="isDisabled"
        :response="response"
        :display-text="(block.props as any).displayText"
        @submit="handleSubmit"
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
        :response="response"
        :display-text="(block.props as any).displayText"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />

      <!-- Approval Buttons -->
      <ApprovalButtons
        v-else-if="block.type === 'approval'"
        :require-reason="(block.props as any).requireReason"
        :allow-reason="(block.props as any).allowReason"
        :reason-placeholder="(block.props as any).reasonPlaceholder"
        :model-value="(block.props as any).modelValue"
        :disabled="isDisabled"
        :response="response"
        @approve="handleApprove"
        @deny="handleDeny"
      />

      <!-- Custom Action Buttons (if needed for advanced cases) -->
      <ActionButtons
        v-else-if="block.type === 'actions'"
        :buttons="(block.props as any).buttons"
        :submit-disabled="(block.props as any).submitDisabled || isDisabled"
        :submit-variant="(block.props as any).submitVariant"
        @submit="() => handleSubmit(undefined)"
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
        :response="response"
        :display-text="(block.props as any).displayText"
        @submit="handleSubmit"
      />

      <!-- Tool Activity Block — collapsible group of Claude Code tool calls -->
      <ToolActivityBlock
        v-else-if="block.type === 'tool-activity'"
        :entries="(block.props as any).entries"
        :label="(block.props as any).label"
        :state="(block.props as any).state"
        :default-open="(block.props as any).defaultOpen"
        :artifact-ref="(block.props as any).artifactRef"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { BlockConfig } from '@app/api'
import PromptBlock from './blocks/PromptBlock.vue'
import NoteBlock from './blocks/NoteBlock.vue'
import ActionButtons from './blocks/ActionButtons.vue'
import LinkBlock, { type Link } from './blocks/LinkBlock.vue'
import ToolActivityBlock from './blocks/ToolActivityBlock.vue'
import FilePickerInput from './inputs/FilePickerInput.vue'
import ChoiceInput from './inputs/ChoiceInput.vue'
import TextInput from './inputs/TextInput.vue'
import ApprovalButtons from './inputs/ApprovalButtons.vue'
import ButtonGroupInput from './inputs/ButtonGroupInput.vue'
import { applicationState } from '@/main'
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

// Internal interaction handlers
const handleBlockResponse = (response: any) => {
  threadsActor.send({
    type: 'RESPOND_TO_BLOCK_INTERACTION',
    messageId: props.messageId,
    response
  })
}

// Event handlers
const handleSubmit = (response: any) => {
  handleBlockResponse(response)
}

const handleApprove = (reason?: string) => {
  handleBlockResponse({ approved: true, reason })
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
    // target is a plugin name - send event to that plugin's actor
    const plugin = applicationState.system.get(target)
    if (plugin) {
      plugin.send(data)
    } else {
      console.warn(`Plugin "${target}" not found`)
    }
  }
}
</script>
