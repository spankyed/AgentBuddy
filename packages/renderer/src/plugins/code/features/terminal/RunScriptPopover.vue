<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="p-1 hover:bg-neutral-700 rounded transition-colors"
        title="Run Script"
      >
        <Play class="w-3.5 h-3.5 text-neutral-400" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="top"
        :side-offset="8"
        align="end"
        class="w-fit max-w-72 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden"
        @close-auto-focus="(e: Event) => e.preventDefault()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
          <span class="text-sm font-medium text-neutral-300">Scripts</span>
          <button
            type="button"
            class="p-1 rounded"
            :class="editing ? 'text-blue-400 hover:text-blue-300' : 'text-neutral-500 hover:text-neutral-300'"
            @click="editing = !editing"
          >
            <Pencil :size="14" />
          </button>
        </div>

        <!-- Script list -->
        <div class="max-h-60 overflow-y-auto select-none">
          <!-- View mode -->
          <template v-if="!editing">
            <div
              v-for="script in localScripts"
              :key="script.id"
              class="group flex items-center hover:bg-neutral-800"
            >
              <button
                type="button"
                class="flex-1 min-w-0 text-left px-3 py-2 text-sm truncate flex items-center gap-2"
                :title="script.command"
                @click="runScript(script)"
              >
                <span class="text-neutral-300 group-hover:text-white">{{ script.label }}</span>
                <span class="text-neutral-600 text-xs font-mono truncate">{{ script.command }}</span>
              </button>
              <button
                type="button"
                class="px-1.5 py-2 text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                title="Run in new terminal"
                @click.stop="runScriptInNew(script)"
              >
                <SquarePlus :size="14" />
              </button>
              <button
                type="button"
                class="px-1.5 py-2 text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                title="Copy command"
                @click.stop="copyCommand(script)"
              >
                <Check v-if="copiedId === script.id" :size="14" class="text-green-400" />
                <Copy v-else :size="14" />
              </button>
            </div>
            <div v-if="localScripts.length === 0" class="px-3 py-4 text-sm text-neutral-600 text-center">
              No scripts saved
            </div>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <div
              v-for="script in localScripts"
              :key="script.id"
              class="flex items-center gap-1 px-2 py-1.5"
            >
              <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                <input
                  v-if="editingId === script.id"
                  ref="editLabelRef"
                  v-model="editLabel"
                  placeholder="Label"
                  class="w-full px-1 py-0.5 text-xs bg-transparent border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:border-primary-500"
                  @keydown.enter="finishEdit(script.id)"
                  @keydown.escape="cancelEdit"
                />
                <span
                  v-else
                  class="text-sm text-neutral-300 truncate cursor-text hover:text-white"
                  @click="startEdit(script)"
                >{{ script.label }}</span>

                <input
                  v-if="editingId === script.id"
                  v-model="editCommand"
                  placeholder="Command"
                  class="w-full px-1 py-0.5 text-xs bg-transparent border border-neutral-700 rounded text-neutral-400 focus:outline-none focus:border-primary-500 font-mono"
                  @keydown.enter="finishEdit(script.id)"
                  @keydown.escape="cancelEdit"
                />
                <span
                  v-else
                  class="text-xs text-neutral-500 truncate cursor-text font-mono"
                  @click="startEdit(script)"
                >{{ script.command }}</span>
              </div>
              <button
                type="button"
                class="p-1 text-neutral-500 hover:text-red-400 flex-shrink-0"
                @click="deleteScript(script.id)"
              >
                <X :size="14" />
              </button>
            </div>
          </template>
        </div>

        <!-- Add script input — pinned below scrollable list -->
        <div v-if="editing" class="flex items-center gap-1 px-2 py-2 border-t border-neutral-700/50">
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <input
              v-model="newLabel"
              placeholder="Label"
              class="w-full px-1 py-0.5 text-xs bg-transparent border border-neutral-700 rounded text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary-500"
              @keydown.enter="addScript"
            />
            <input
              v-model="newCommand"
              placeholder="Command"
              class="w-full px-1 py-0.5 text-xs bg-transparent border border-neutral-700 rounded text-neutral-400 placeholder-neutral-600 focus:outline-none focus:border-primary-500 font-mono"
              @keydown.enter="addScript"
            />
          </div>
          <button
            type="button"
            class="p-1 rounded flex-shrink-0"
            :class="canAdd ? 'text-neutral-400 hover:text-white hover:bg-neutral-700/50' : 'text-neutral-700 cursor-not-allowed'"
            :disabled="!canAdd"
            @click="addScript"
          >
            <Plus :size="14" />
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Play, Pencil, X, Plus, Copy, Check, SquarePlus } from 'lucide-vue-next'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import type { TerminalScript } from '@app/api'

const props = defineProps<{
  scripts: TerminalScript[]
}>()

const emit = defineEmits<{
  (e: 'run', script: TerminalScript): void
  (e: 'run-new', script: TerminalScript): void
  (e: 'update', scripts: TerminalScript[]): void
}>()

const open = ref(false)
const editing = ref(false)
const localScripts = ref<TerminalScript[]>([...props.scripts])

// Edit existing script
const editingId = ref<string | null>(null)
const editLabel = ref('')
const editCommand = ref('')
const editLabelRef = ref<HTMLInputElement[]>([])

// Add new script
const newLabel = ref('')
const newCommand = ref('')
const canAdd = computed(() => newLabel.value.trim() && newCommand.value.trim())

// Copy feedback
const copiedId = ref<string | null>(null)

function copyCommand(script: TerminalScript) {
  navigator.clipboard.writeText(script.command)
  copiedId.value = script.id
  setTimeout(() => { copiedId.value = null }, 1500)
}

// Sync from props
watch(() => props.scripts, (val) => {
  localScripts.value = [...val]
}, { deep: true })

// Reset when popover closes
watch(open, (isOpen) => {
  if (!isOpen) {
    editing.value = false
    editingId.value = null
    newLabel.value = ''
    newCommand.value = ''
  }
})

function runScript(script: TerminalScript) {
  emit('run', script)
  open.value = false
}

function runScriptInNew(script: TerminalScript) {
  emit('run-new', script)
  open.value = false
}

function startEdit(script: TerminalScript) {
  editingId.value = script.id
  editLabel.value = script.label
  editCommand.value = script.command
}

function finishEdit(id: string) {
  const label = editLabel.value.trim()
  const command = editCommand.value.trim()
  if (label && command) {
    const script = localScripts.value.find(s => s.id === id)
    if (script && (script.label !== label || script.command !== command)) {
      script.label = label
      script.command = command
      emit('update', [...localScripts.value])
    }
  }
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function deleteScript(id: string) {
  const updated = localScripts.value.filter(s => s.id !== id)
  localScripts.value = updated
  emit('update', updated)
}

function addScript() {
  const label = newLabel.value.trim()
  const command = newCommand.value.trim()
  if (!label || !command) return
  const newScript: TerminalScript = {
    id: `ts_${Date.now()}`,
    label,
    command
  }
  const updated = [...localScripts.value, newScript]
  localScripts.value = updated
  newLabel.value = ''
  newCommand.value = ''
  emit('update', updated)
}
</script>
