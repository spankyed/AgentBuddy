<template>
  <PopoverRoot v-model:open="open">
    <PopoverAnchor v-if="virtualReference" :reference="virtualReference" />
    <PopoverTrigger as-child>
      <button
        type="button"
        class="hidden @md:block p-2 text-neutral-500"
        :class="disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-neutral-200'"
        aria-label="Quick message"
        :disabled="disabled"
      >
        <Sparkle :size="20" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="virtualReference ? 'bottom' : 'top'"
        :side-offset="8"
        align="center"
        class="w-64 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
          <span class="text-sm font-medium text-neutral-300">Quick Prompts</span>
          <button
            type="button"
            class="p-1 rounded"
            :class="editing ? 'text-blue-400 hover:text-blue-300' : 'text-neutral-500 hover:text-neutral-300'"
            @click="editing = !editing"
          >
            <Pencil :size="14" />
          </button>
        </div>

        <!-- Prompt list -->
        <div class="max-h-60 overflow-y-auto select-none">
          <template v-if="!editing">
            <TooltipProvider :delay-duration="400">
              <div
                v-for="prompt in prompts"
                :key="prompt.id"
                class="group relative"
              >
                <TooltipRoot :disabled="!truncatedIds.has(prompt.id)">
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      :data-prompt-id="prompt.id"
                      class="w-full text-left px-3 py-2 pr-8 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white truncate"
                      @click="selectPrompt(prompt.text)"
                      @mouseenter="checkTruncation(prompt)"
                    >
                      <span class="text-neutral-600 mr-3">{{ prompts.indexOf(prompt) + 1 }}</span>{{ prompt.text.split('\n')[0] }}<span v-if="prompt.text.includes('\n')" class="text-neutral-500">...</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent
                      side="right"
                      :side-offset="8"
                      class="max-w-xs px-3 py-2 text-sm text-neutral-200 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl z-[100] whitespace-pre-wrap"
                    >
                      {{ prompt.text }}
                    </TooltipContent>
                  </TooltipPortal>
                </TooltipRoot>
                <button
                  type="button"
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100"
                  title="Copy prompt"
                  @click.stop="copyPrompt(prompt.id, prompt.text)"
                >
                  <Check v-if="copiedId === prompt.id" :size="14" class="text-green-400" />
                  <Copy v-else :size="14" />
                </button>
              </div>
            </TooltipProvider>
            <div v-if="prompts.length === 0" class="px-3 py-4 text-sm text-neutral-600 text-center">
              No quick prompts
            </div>
          </template>

          <template v-else>
            <ArrangeableList
              :identifier="'quick-prompts'"
              :group="reorderGroup"
              :targets="[reorderGroup]"
              :list="localPrompts"
              :options="arrangeableOptions"
              class="quick-prompts-list"
              @drop-item="reorderPrompt"
            >
              <template #default="{ item: prompt }">
                <div class="flex items-start gap-1 px-1 pr-3 pb-1 pt-2 bg-neutral-900 rounded-md">
                  <span
                    data-handle
                    class="flex-shrink-0 cursor-grab text-neutral-600 hover:text-neutral-400 p-1 mt-0.5 pointer-events-auto"
                    title="Drag to reorder"
                    @click.stop
                  >
                    <GripVertical :size="12" class="pointer-events-none" />
                  </span>
                  <textarea
                    v-if="editingId === prompt.id"
                    v-model="editingText"
                    rows="1"
                    class="flex-1 min-w-0 px-0 py-0.5 text-sm bg-transparent border-none text-white focus:outline-none resize-none overflow-hidden"
                    @input="autoResizeAndUpdate($event, prompt.id)"
                    @blur="finishEdit(prompt.id)"
                    @keydown.enter.exact.prevent="finishEdit(prompt.id)"
                    @keydown.escape.prevent="cancelEdit"
                  />
                  <span
                    v-else
                    class="flex-1 min-w-0 text-sm text-neutral-300 truncate cursor-text hover:text-white"
                    :title="prompt.text"
                    @click="startEdit(prompt)"
                  >{{ prompt.text.split('\n')[0] }}<span v-if="prompt.text.includes('\n')" class="text-neutral-500">...</span></span>
                  <button
                    type="button"
                    class="p-1 text-neutral-500 hover:text-red-400 flex-shrink-0"
                    @click="deletePrompt(prompt.id)"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </template>
            </ArrangeableList>
          </template>
        </div>

        <!-- Add prompt input — pinned below scrollable list -->
        <div v-if="editing" class="flex items-center gap-2 px-3 py-2 border-t border-neutral-700/50">
          <textarea
            ref="addPromptRef"
            v-model="newPromptText"
            rows="1"
            placeholder="Add prompt..."
            class="flex-1 px-0 py-0.5 text-sm bg-transparent border-none text-white placeholder-neutral-600 focus:outline-none resize-none"
            style="max-height: calc(1.5em * 3 + 12px)"
            @input="autoResize($event)"
            @keydown.enter.exact.prevent="addPrompt"
          />
          <button
            type="button"
            class="p-1 rounded flex-shrink-0"
            :class="newPromptText.trim() ? 'text-neutral-400 hover:text-white hover:bg-neutral-700/50' : 'text-neutral-700 cursor-not-allowed'"
            :disabled="!newPromptText.trim()"
            @click="addPrompt"
          >
            <Plus :size="14" />
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue'
import { Sparkle, Pencil, X, Plus, Copy, Check, GripVertical } from 'lucide-vue-next'
import { PopoverRoot, PopoverTrigger, PopoverAnchor, PopoverPortal, PopoverContent, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipProvider } from 'reka-ui'
import type { ReferenceElement } from '@floating-ui/vue'
import { ArrangeableList, type MovingItem } from 'vue-arrange'
import type { QuickPrompt } from '@app/api'

const props = defineProps<{
  prompts: QuickPrompt[]
  disabled?: boolean
  virtualReference?: ReferenceElement | null
}>()

const emit = defineEmits<{
  (e: 'select', text: string): void
  (e: 'update', prompts: QuickPrompt[]): void
}>()

const open = defineModel<boolean>('open', { default: false })
const truncatedIds = reactive(new Set<string>())
const editing = ref(false)
const newPromptText = ref('')
const localPrompts = ref<QuickPrompt[]>([...props.prompts])
const addPromptRef = ref<HTMLTextAreaElement | null>(null)
const editingId = ref<string | null>(null)
const editingText = ref('')
const copiedId = ref<string | null>(null)

const reorderGroup = Symbol('quick-prompts')
const arrangeableOptions = {
  handle: true,
  liftDelay: 100,
  hoverClass: 'shadow-lg shadow-black/40 scale-[1.02] cursor-grabbing',
  pickedItemClass: 'opacity-30',
}

let droppingItem = false

watch(() => props.prompts, (val) => {
  if (droppingItem) {
    droppingItem = false
    return
  }
  localPrompts.value = [...val]
}, { deep: true })

// Reset edit mode when popover closes, check truncation when it opens
watch(open, async (isOpen) => {
  if (!isOpen) {
    editing.value = false
    editingId.value = null
    newPromptText.value = ''
    truncatedIds.clear()
  } else {
    await nextTick()
    for (const prompt of props.prompts) {
      if (prompt.text.includes('\n')) {
        truncatedIds.add(prompt.id)
        continue
      }
      const el = document.querySelector<HTMLButtonElement>(`[data-prompt-id="${prompt.id}"]`)
      if (el && el.scrollWidth > el.clientWidth) {
        truncatedIds.add(prompt.id)
      }
    }
  }
})

function checkTruncation(prompt: QuickPrompt) {
  const isMultiline = prompt.text.includes('\n')
  if (isMultiline) {
    truncatedIds.add(prompt.id)
    return
  }
  // Will be checked on next mouseenter after the element renders
  const el = document.querySelector<HTMLButtonElement>(`[data-prompt-id="${prompt.id}"]`)
  if (el && el.scrollWidth > el.clientWidth) {
    truncatedIds.add(prompt.id)
  } else {
    truncatedIds.delete(prompt.id)
  }
}

function selectPrompt(text: string) {
  emit('select', text)
  open.value = false
}

function reorderPrompt(moving: MovingItem<QuickPrompt>) {
  if (!moving.destination?.listItems) return
  droppingItem = true
  const updated = [...moving.destination.listItems]
  localPrompts.value = updated
  emit('update', updated)
}

function copyPrompt(id: string, text: string) {
  navigator.clipboard.writeText(text)
  copiedId.value = id
  setTimeout(() => {
    copiedId.value = null
  }, 1500)
}

async function startEdit(prompt: QuickPrompt) {
  editingId.value = prompt.id
  editingText.value = prompt.text
  await nextTick()
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLTextAreaElement>('.quick-prompts-list textarea')
    if (el) {
      resizeTextarea(el)
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  })
}

function commitEdit(id: string) {
  const trimmed = editingText.value.trim()
  if (!trimmed) return
  const prompt = localPrompts.value.find(p => p.id === id)
  if (prompt && prompt.text !== trimmed) {
    prompt.text = trimmed
    emit('update', [...localPrompts.value])
  }
}

function finishEdit(id: string) {
  commitEdit(id)
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function deletePrompt(id: string) {
  const updated = localPrompts.value.filter(p => p.id !== id)
  localPrompts.value = updated
  emit('update', updated)
}

function resizeTextarea(el: HTMLTextAreaElement) {
  el.style.overflowY = 'hidden'
  el.style.height = 'auto'
  const height = el.scrollHeight
  el.style.height = height + 1 + 'px'
  const maxHeight = parseFloat(getComputedStyle(el).maxHeight)
  if (maxHeight && height + 1 > maxHeight) {
    el.style.overflowY = 'auto'
  }
}

function autoResize(event: Event) {
  resizeTextarea(event.target as HTMLTextAreaElement)
}

function autoResizeAndUpdate(event: Event, id: string) {
  resizeTextarea(event.target as HTMLTextAreaElement)
  commitEdit(id)
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

<style scoped>
.quick-prompts-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

:deep(.cursor-grabbing) {
  position: fixed !important;
  border-radius: 0.375rem;
}

:deep(.arrangeable-list__transition-all) {
  transition-duration: 0s;
}
</style>
