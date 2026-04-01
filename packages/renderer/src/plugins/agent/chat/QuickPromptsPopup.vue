<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="hidden @md:block p-2 transition-colors text-neutral-500"
        :class="disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-neutral-200'"
        aria-label="Quick message"
        :disabled="disabled"
      >
        <Sparkle :size="20" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="top"
        :side-offset="8"
        align="start"
        class="w-64 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
          <span class="text-sm font-medium text-neutral-300">Quick Prompts</span>
          <button
            type="button"
            class="p-1 rounded transition-colors"
            :class="editing ? 'text-blue-400 hover:text-blue-300' : 'text-neutral-500 hover:text-neutral-300'"
            @click="editing = !editing"
          >
            <Pencil :size="14" />
          </button>
        </div>

        <!-- Prompt list -->
        <div class="max-h-60 overflow-y-auto">
          <template v-if="!editing">
            <button
              v-for="prompt in prompts"
              :key="prompt.id"
              type="button"
              class="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors truncate"
              :title="prompt.text"
              @click="selectPrompt(prompt.text)"
            >
              {{ prompt.text.split('\n')[0] }}<span v-if="prompt.text.includes('\n')" class="text-neutral-500">...</span>
            </button>
            <div v-if="prompts.length === 0" class="px-3 py-4 text-sm text-neutral-600 text-center">
              No quick prompts
            </div>
          </template>

          <template v-else>
            <div
              v-for="prompt in localPrompts"
              :key="prompt.id"
              class="flex items-start gap-2 px-3 pb-1 pt-2"
            >
              <span
                class="flex-1 min-w-0 text-sm text-neutral-300 truncate"
                :title="prompt.text"
              >{{ prompt.text.split('\n')[0] }}<span v-if="prompt.text.includes('\n')" class="text-neutral-500">...</span></span>
              <button
                type="button"
                class="p-1 text-neutral-500 hover:text-red-400 transition-colors flex-shrink-0"
                @click="deletePrompt(prompt.id)"
              >
                <X :size="14" />
              </button>
            </div>
            <div class="flex items-center gap-2 px-3 py-2 border-t border-neutral-700/50 mt-1">
              <textarea
                ref="addPromptRef"
                v-model="newPromptText"
                rows="1"
                placeholder="Add prompt..."
                class="flex-1 px-0 py-0.5 text-sm bg-transparent border-none text-white placeholder-neutral-600 focus:outline-none resize-none overflow-y-hidden"
                style="max-height: calc(1.5em * 3 + 12px)"
                @input="autoResize($event)"
                @keydown.enter.exact.prevent="addPrompt"
              />
              <button
                type="button"
                class="p-1 rounded transition-colors flex-shrink-0"
                :class="newPromptText.trim() ? 'text-neutral-400 hover:text-white hover:bg-neutral-700/50' : 'text-neutral-700 cursor-not-allowed'"
                :disabled="!newPromptText.trim()"
                @click="addPrompt"
              >
                <Plus :size="14" />
              </button>
            </div>
          </template>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Sparkle, Pencil, X, Plus } from 'lucide-vue-next'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import type { QuickPrompt } from '@app/api'

const props = defineProps<{
  prompts: QuickPrompt[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', text: string): void
  (e: 'update', prompts: QuickPrompt[]): void
}>()

const open = defineModel<boolean>('open', { default: false })
const editing = ref(false)
const newPromptText = ref('')
const localPrompts = ref<QuickPrompt[]>([...props.prompts])
const addPromptRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.prompts, (val) => {
  localPrompts.value = [...val]
}, { deep: true })

// Reset edit mode when popover closes
watch(open, (isOpen) => {
  if (!isOpen) {
    editing.value = false
    newPromptText.value = ''
  }
})

function selectPrompt(text: string) {
  emit('select', text)
  open.value = false
}

function deletePrompt(id: string) {
  const updated = localPrompts.value.filter(p => p.id !== id)
  localPrompts.value = updated
  emit('update', updated)
}

function autoResize(event: Event) {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
  const maxHeight = parseFloat(getComputedStyle(el).maxHeight)
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function emitUpdate() {
  emit('update', [...localPrompts.value])
}

function addPrompt() {
  const text = newPromptText.value.trim()
  if (!text) return
  const newPrompt: QuickPrompt = {
    id: `qp_${Date.now()}`,
    text,
  }
  const updated = [...localPrompts.value, newPrompt]
  localPrompts.value = updated
  newPromptText.value = ''
  if (addPromptRef.value) {
    addPromptRef.value.style.height = 'auto'
    addPromptRef.value.style.overflowY = 'hidden'
  }
  emit('update', updated)
}
</script>
