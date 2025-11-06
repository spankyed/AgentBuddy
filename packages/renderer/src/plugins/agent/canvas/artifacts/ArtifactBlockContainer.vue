<template>
  <div class="artifact-block-container space-y-4">
    <template v-for="(block, index) in blocks" :key="index">
      <!-- Common blocks (shared with messages) -->

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

      <!-- Link Block -->
      <LinkBlock
        v-else-if="block.type === 'link'"
        :links="(block.props as any).links"
        @navigate="handleNavigate"
      />

      <!-- Button Group -->
      <ButtonGroupInput
        v-else-if="block.type === 'button-group'"
        :buttons="(block.props as any).buttons"
        :keep-interactive="(block.props as any).keepInteractive"
        :disabled="isDisabled"
        :response="response"
        :display-text="(block.props as any).displayText"
        @submit="handleSubmit"
      />

      <!-- Artifact-specific blocks -->

      <!-- Code Display Block -->
      <CodeDisplayBlock
        v-else-if="block.type === 'code-display'"
        :code="(block.props as any).code"
        :language="(block.props as any).language"
      />

      <!-- Todo List Block -->
      <TodoListBlock
        v-else-if="block.type === 'todo-list'"
        :tasks="(block.props as any).tasks"
        :status="(block.props as any).status"
        @task-toggle="handleTaskToggle"
      />

      <!-- Slack Channels Block -->
      <SlackChannelsBlock
        v-else-if="block.type === 'slack-channels'"
        :channels="(block.props as any).channels"
        @channel-click="handleChannelClick"
      />

      <!-- Workspace Config Block -->
      <WorkspaceConfigBlock
        v-else-if="block.type === 'workspace-config'"
        :config="(block.props as any).config"
      />

      <!-- Image Display Block -->
      <ImageDisplayBlock
        v-else-if="block.type === 'image-display'"
        :image-url="(block.props as any).imageUrl"
        :alt="(block.props as any).alt"
      />

      <!-- Review Display Block -->
      <ReviewDisplayBlock
        v-else-if="block.type === 'review-display'"
        :review-content="(block.props as any).reviewContent"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { BlockConfig } from '@app/api'
import PromptBlock from '../../chat/interactions/blocks/PromptBlock.vue'
import NoteBlock from '../../chat/interactions/blocks/NoteBlock.vue'
import LinkBlock, { type Link } from '../../chat/interactions/blocks/LinkBlock.vue'
import ButtonGroupInput from '../../chat/interactions/inputs/ButtonGroupInput.vue'
import CodeDisplayBlock from './blocks/CodeDisplayBlock.vue'
import TodoListBlock from './blocks/TodoListBlock.vue'
import SlackChannelsBlock from './blocks/SlackChannelsBlock.vue'
import WorkspaceConfigBlock from './blocks/WorkspaceConfigBlock.vue'
import ImageDisplayBlock from './blocks/ImageDisplayBlock.vue'
import ReviewDisplayBlock from './blocks/ReviewDisplayBlock.vue'
import { applicationState } from '@/main'
import { id as agentId } from '@/plugins/agent/state'

interface Props {
  blocks: BlockConfig[]
  artifactId: string
  threadId: string
  isDisabled?: boolean
  response?: any
}

const props = withDefaults(defineProps<Props>(), {
  isDisabled: false
})

const agentActor = applicationState.system.get(agentId)

// Internal interaction handlers
const handleBlockResponse = (response: any) => {
  agentActor.send({
    type: 'RESPOND_TO_ARTIFACT_BLOCK_INTERACTION',
    artifactId: props.artifactId,
    threadId: props.threadId,
    response
  })
}

// Event handlers
const handleSubmit = (response: any) => {
  handleBlockResponse(response)
}

const handleTaskToggle = (taskId: string, completed: boolean) => {
  handleBlockResponse({ action: 'toggle-task', taskId, taskCompleted: completed })
}

const handleChannelClick = (channelId: string) => {
  handleBlockResponse({ action: 'view-channel', channelId })
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
