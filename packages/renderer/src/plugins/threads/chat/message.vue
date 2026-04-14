<template>
  <div
    :class="[
      'flex pb-3 animate-fade-in w-full',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div class="relative group max-w-full min-w-0">
      <!-- Aside: collapsed interactive message -->
      <div v-if="message.autoHide && message.asideText"
           class="text-xs text-neutral-500 italic py-1 px-2">
        {{ message.asideText }}
      </div>

      <!-- Normal message rendering -->
      <template v-else>
      <!-- Floating hover UI -->
      <div
        class="absolute transition-opacity duration-200 opacity-0 pointer-events-none -bottom-3 -right-4 z-10 group-hover:opacity-100 group-hover:pointer-events-auto"
      >
        <div class="flex items-center overflow-hidden border rounded-lg shadow-lg bg-neutral-800 border-neutral-700">
          <!-- Timestamp -->
          <span v-if="message.createdAt" class="text-xs text-neutral-400 px-3 py-1.5 border-r border-neutral-700 whitespace-nowrap">
            {{ formatTime(new Date(message.createdAt)) }}
          </span>

          <!-- Action buttons -->
          <button
            v-if="isUser"
            @click="$emit('revert', message.id)"
            @contextmenu.prevent="openRevertMenu"
            class="p-1.5 hover:bg-neutral-700 transition-colors text-neutral-300"
            title="Revert (right-click for options)"
          >
            <Undo2 :size="16" />
          </button>

          <button
            v-if="message.forkable !== false"
            @click="$emit('fork', message.id)"
            class="p-1.5 hover:bg-neutral-700 transition-colors text-neutral-300"
            title="Fork conversation"
          >
            <GitFork :size="16" />
          </button>

          <button
            @click="copyMessageText"
            class="p-1.5 hover:bg-neutral-700 transition-colors text-neutral-300"
            title="Copy message text"
          >
            <Copy :size="16" />
          </button>
        </div>
      </div>

      <!-- Bubble (visual styling + overflow constraint) -->
      <div
        :class="[
          'rounded-xl px-4 py-3 transition-all duration-200 overflow-hidden',
          isUser
            ? 'bg-neutral-800/80 text-neutral-100 border border-neutral-700/30'
            : ' text-neutral-100 border border-neutral-800',
          isUser && isCommand && 'command-bubble',
          (message as any).status === 'cancelled' ? 'opacity-50' : 'hover:shadow-md',
        ]"
      >
        <!-- Attachments: files then images, horizontal scroll -->
        <div v-if="message.references?.files?.length || message.references?.images?.length"
          class="flex items-end gap-2 mb-2 overflow-x-auto scrollbar-thin">
          <ImageThumbnail v-for="(img, index) in message.references.images" :key="'i-'+index"
            :src="img.url" :name="img.name" @click="$emit('open-lightbox', img.url)" />
          <FileBlock v-for="(file, index) in message.references.files" :key="'f-'+index"
            :file="file" class="flex-shrink-0" />
        </div>

        <!-- Tool-activity blocks render ABOVE text so the work log
             appears before the model's commentary, not after it. -->
        <InteractionContainer
          v-if="toolActivityBlocks.length > 0"
          class="mb-2"
          :blocks="toolActivityBlocks"
          :message-id="message.id"
          :is-disabled="!!message.responseTimestamp"
          :response="message.blockResponse"
        />

        <!-- Message content -->
        <div class="leading-relaxed text-[15px]">
          <TiptapEditor mode="viewer" variant="chat" :model-value="message.text" :is-command="isCommand" />
        </div>

        <!-- Other block types (approval, choice, etc.) render BELOW text -->
        <InteractionContainer
          v-if="otherBlocks.length > 0"
          :blocks="otherBlocks"
          :message-id="message.id"
          :is-disabled="!!message.responseTimestamp"
          :response="message.blockResponse"
        />

        <!-- Typing indicator for AI messages -->
        <div
          v-if="!isUser && isTyping"
          class="flex gap-1.5 mt-2.5"
        >
          <span class="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-pulse"></span>
          <span class="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-pulse" style="animation-delay: 200ms"></span>
          <span class="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-pulse" style="animation-delay: 400ms"></span>
        </div>
      </div>
      </template>

      <!-- Queued indicator — shown on user messages waiting behind an active turn -->
      <div
        v-if="isUser && (message as any).status === 'queued'"
        class="flex items-center justify-end gap-1.5 mt-1 px-1 text-xs text-neutral-400"
      >
        <span class="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
        <span>Queued</span>
      </div>
      <!-- Cancelled indicator — queued message was dropped when turn was killed -->
      <div
        v-else-if="isUser && (message as any).status === 'cancelled'"
        class="flex items-center justify-end gap-1.5 mt-1 px-1 text-xs text-neutral-500"
      >
        <span class="inline-block w-1.5 h-1.5 bg-neutral-500 rounded-full" />
        <span>Cancelled — resend</span>
      </div>
    </div>

    <!-- Revert context menu (right-click on revert button) -->
    <ContextMenuPopup
      :show="revertMenu.showMenu.value"
      :pos="revertMenu.menuPos.value"
      :items="revertMenuItems"
      @close="revertMenu.showMenu.value = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MessageEntity } from '@app/api'
import { Undo2, GitFork, Copy, FileCode2 } from 'lucide-vue-next'
import InteractionContainer from './interactions/InteractionContainer.vue'
import FileBlock from './FileBlock.vue'
import ImageThumbnail from './ImageThumbnail.vue'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'
import ContextMenuPopup from '@/core/components/design/ContextMenuPopup.vue'
import { useContextMenu } from '@/core/composables/useContextMenu'

interface ChatMessageProps {
  message: MessageEntity
  isTyping?: boolean
}

interface ChatMessageEmits {
  (e: 'revert', messageId: string): void
  (e: 'revert-with-files', messageId: string): void
  (e: 'fork', messageId: string): void
  (e: 'open-lightbox', imageSrc: string): void
}

const props = withDefaults(defineProps<ChatMessageProps>(), {
  isTyping: false
})

const emit = defineEmits<ChatMessageEmits>()

const revertMenu = useContextMenu()

const revertMenuItems = [
  {
    label: 'Revert & restore files',
    icon: FileCode2,
    class: 'text-neutral-200',
    action: () => emit('revert-with-files', props.message.id),
  },
]

function openRevertMenu(e: MouseEvent) {
  revertMenu.open(e, revertMenuItems.length)
}

const isUser = computed(() => props.message.sender === 'user')
const isCommand = computed(() => props.message.isCommand ?? false)

// Split blocks by type so tool-activity renders above text while
// other block types (approval, choice, etc.) render below text.
const toolActivityBlocks = computed(() =>
  (props.message.blocks ?? []).filter((b: any) => b.type === 'tool-activity')
)
const otherBlocks = computed(() =>
  (props.message.blocks ?? []).filter((b: any) => b.type !== 'tool-activity')
)

const copyMessageText = async () => {
  try {
    await navigator.clipboard.writeText(props.message.text)
  } catch (error) {
    console.error('Failed to copy text:', error)
  }
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

<style lang="scss" scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

.command-bubble {
  border-color: rgba(180, 180, 255, 0.3);
  box-shadow: 0 0 8px -2px rgba(180, 180, 255, 0.12);
}

</style>
