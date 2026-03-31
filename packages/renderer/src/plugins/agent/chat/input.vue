<template>
  <div class="flex flex-col w-full">
    <form
      @submit.prevent="handleSubmit"
      class="@container pb-4 pt-3 max-w-[80%] mx-auto w-full flex-shrink-0 overflow-visible"
    >
      <div
        class="relative flex flex-col border rounded-lg bg-neutral-800 overflow-visible"
        :class="[$style.input, { 'opacity-50': disabled }]"
        data-onboarding-id="agent-chat-input"
        @paste="handlePaste">
        <StatusIndicator/>

        <!-- Image preview strip -->
        <div v-if="pendingImages.length" class="flex flex-wrap gap-2 px-3 pt-3">
          <div v-for="(img, index) in pendingImages" :key="index" class="relative group">
            <img :src="img" class="w-20 h-20 object-cover rounded-lg border border-neutral-700 cursor-pointer hover:opacity-80 transition-opacity"
              @click="$emit('open-lightbox', img)" />
            <button type="button" @click="removeImage(index)"
              class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-neutral-900/80 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors opacity-0 group-hover:opacity-100">
              <X :size="10" />
            </button>
          </div>
        </div>

        <!-- Editor container -->
        <div class="relative w-full min-h-12">
          <TiptapEditor
            ref="tiptapRef"
            mode="input"
            variant="chat"
            :placeholder="disabled ? 'API keys required to use chat' : 'Message Agent'"
            :disabled="disabled"
            editor-class="w-full px-1.5 pr-2 py-2 rounded-lg min-h-12 focus:outline-none"
            @submit="handleSubmit"
            @update:model-value="onContentUpdate"
          />
        </div>

        <!-- Buttons row -->
        <div class="relative flex items-center justify-between px-3 pb-2 text-neutral-500">
          <!-- Left side buttons -->
          <div class="flex items-center">
            <!-- Collapsed: ... dropdown menu (narrow) -->
            <DropdownMenuRoot>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="p-2 transition-colors text-neutral-500 @md:hidden"
                  :class="disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-neutral-200'"
                  aria-label="More actions"
                  :disabled="disabled"
                >
                  <EllipsisVertical :size="20" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent
                  align="start"
                  :side-offset="8"
                  class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 z-50"
                >
                  <DropdownMenuItem
                    v-for="btn in leftButtons"
                    :key="btn.action"
                    @select="handleButtonClick(btn.action)"
                    class="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                    :class="btn.class"
                  >
                    <component :is="btn.icon" :size="16" />
                    <span>{{ btn.label }}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>

            <!-- Expanded: full action buttons (wide) -->
            <button
              v-for="btn in leftButtons"
              :key="btn.action"
              type="button"
              class="hidden @md:block p-2 transition-colors text-neutral-500"
              :class="[disabled ? 'cursor-not-allowed opacity-50' : (!btn.class && 'hover:text-neutral-200'), btn.class]"
              :aria-label="btn.label"
              :disabled="disabled"
              @click="handleButtonClick(btn.action)"
            >
              <component :is="btn.icon" :size="20" />
            </button>

            <!-- Mode/Phase Selector (narrow) -->
            <div class="@md:hidden">
              <ModePhaseSelector
                :modes="modes"
                :current-mode="currentMode"
                :current-phase="currentPhase"
                :forced-mode="currentThread?.forcedMode"
                :disabled="disabled"
                @mode-change="handleModeChange"
                @phase-change="handlePhaseChange"
              />
            </div>
          </div>

          <!-- Mode/Phase Selector -->
          <div class="hidden @md:block">
            <ModePhaseSelector
              :modes="modes"
              :current-mode="currentMode"
              :current-phase="currentPhase"
              :forced-mode="currentThread?.forcedMode"
              :disabled="disabled"
              @mode-change="handleModeChange"
              @phase-change="handlePhaseChange"
            />
          </div>

          <!-- Right side buttons -->
          <div class="flex items-center gap-2">
            <!-- Stop button -->
            <Button
              title="Stop agent work"
              type="submit"
              :disabled="(!messageContent && !pendingImages.length) || disabled"
              variant="secondary"
            >
              <span class="hidden @md:inline">Stop</span>
              <Square :size="22" />
            </Button>
            <Button
              type="submit"
              :disabled="(!messageContent && !pendingImages.length) || disabled"
            >
              <span class="hidden @md:inline">Send</span>
              <CornerDownLeft class="-rotate-45" :size="16" />
            </Button>

          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Mic, MicOff, PaperclipIcon, Sparkle, AtSign, CornerDownLeft, EllipsisVertical, X } from 'lucide-vue-next'
import { useSpeechRecognition } from './composables/useSpeechRecognition'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'reka-ui'
import Square from './square-svg.vue'
import ModePhaseSelector from './ModePhaseSelector.vue'
import type { Component } from 'vue'
import Button from '@/core/components/design/button.vue'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'
import StatusIndicator from './status-indicator.vue'
import type { AgentThreadData, AgentMode } from '@app/api'

const props = defineProps<{
  currentThread: AgentThreadData
  currentMode: string
  currentPhase?: string
  modes: AgentMode[]
  disabled?: boolean
}>()

// Define emits including new button actions
const emit = defineEmits<{
  (e: 'send-message', message: string, images?: string[]): void
  (e: 'quick-message'): void
  (e: 'attach-file'): void
  (e: 'voice-input'): void
  (e: 'stop'): void
  (e: 'mode-change', mode: string): void
  (e: 'phase-change', phase: string): void
  (e: 'open-lightbox', imageSrc: string): void
}>()


interface ActionButton {
  icon: Component
  label: string
  action: string
  class?: string
}

const tiptapRef = ref<InstanceType<typeof TiptapEditor> | null>(null)
const messageContent = ref('')
const pendingImages = ref<string[]>([])

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

const handlePaste = (event: ClipboardEvent) => {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const file = item.getAsFile()
      if (!file || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) continue
      const reader = new FileReader()
      reader.onload = () => {
        pendingImages.value = [...pendingImages.value, reader.result as string]
      }
      reader.readAsDataURL(file)
    }
  }
}

const removeImage = (i: number) => {
  pendingImages.value = pendingImages.value.filter((_, idx) => idx !== i)
}

const onContentUpdate = (md: string) => {
  messageContent.value = md
}

const { isSupported: speechSupported, isListening, toggle: toggleSpeech } = useSpeechRecognition({
  onResult(transcript) {
    const editor = tiptapRef.value?.editor
    if (!editor) return
    const trimmed = transcript.trim()
    if (!trimmed) return
    editor.commands.insertContent(trimmed + ' ')
  },
})

const leftButtons = computed<ActionButton[]>(() => {
  const buttons: ActionButton[] = [
    {
      icon: AtSign,
      label: 'Add context',
      action: 'add-context'
    },
    {
      icon: PaperclipIcon,
      label: 'Attach file',
      action: 'attach-file'
    },
    {
      icon: Sparkle,
      label: 'Quick message',
      action: 'quick-message'
    },
  ]
  if (speechSupported.value) {
    buttons.push({
      icon: isListening.value ? MicOff : Mic,
      label: isListening.value ? 'Stop listening' : 'Voice input',
      action: 'voice-input',
      class: isListening.value ? 'text-red-400 animate-pulse' : undefined,
    })
  }
  return buttons
})


// Computed properties for cleaner template
const visibleModes = computed(() => props.modes.filter(m => !m.hidden))

// Reset to first visible mode when switching from forced-mode thread
watch(() => props.currentThread?.id, () => {
  if (props.currentMode && !props.currentThread?.forcedMode && !visibleModes.value.some(m => m.id === props.currentMode)) {
    emit('mode-change', visibleModes.value[0].id)
  }
})

const handleButtonClick = (action: string) => {
  if (props.disabled) return
  if (action === 'voice-input') {
    toggleSpeech()
    emit('voice-input')
    return
  }
  // @ts-expect-error - dynamic event emission
  emit(action)
}

const handleModeChange = (newMode: string) => {
  if (props.disabled) return
  emit('mode-change', newMode)
}

const handlePhaseChange = (newPhase: string) => {
  if (props.disabled) return
  emit('phase-change', newPhase)
}

const handleSubmit = () => {
  if (props.disabled) return
  const editor = tiptapRef.value?.editor
  if (!editor) return
  const md = (editor.storage as any).markdown.getMarkdown() as string
  if (md.trim() || pendingImages.value.length) {
    emit('send-message', md, pendingImages.value.length ? [...pendingImages.value] : undefined)
    editor.commands.clearContent(true)
    messageContent.value = ''
    pendingImages.value = []
  }
}
</script>

<style lang="scss" module>
.input {
  border-color: rgb(60 60 60);;
}
</style>
