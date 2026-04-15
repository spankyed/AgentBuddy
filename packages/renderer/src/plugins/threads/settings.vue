<template>
  <div class="max-w-3xl">
    <!-- Status Management Section -->
    <CollapsibleSection label="Thread Statuses" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Manage the status options available for threads
      </p>
      <div class="space-y-3">
        <div
          v-for="(status, index) in statuses"
          :key="`status-${index}`"
          class="group flex items-center gap-3"
        >
          <!-- Color Picker -->
          <div class="relative">
            <button
              @click="togglePicker(`status:${index}`)"
              class="w-8 h-8 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
              :style="{ backgroundColor: status.color }"
              title="Change color"
            />
            <!-- Simple color picker dropdown -->
            <div
              v-if="activePicker === `status:${index}`"
              class="absolute z-10 top-10 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1"
            >
              <button
                v-for="color in colorOptions"
                :key="color"
                @click="statuses[index].color = color; closePicker(); saveStatuses()"
                class="w-7 h-7 rounded hover:scale-110 transition-transform"
                :style="{ backgroundColor: color }"
              />
            </div>
          </div>

          <!-- Status Label -->
          <input
            v-model="status.label"
            type="text"
            placeholder="Status label"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            @input="debouncedSave"
          />

          <!-- Remove Button -->
          <button
            @click="removeStatus(index)"
            class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
            :disabled="statuses.length <= 1"
            title="Remove status"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Add Status Button -->
        <button
          @click="addStatus"
          class="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-all flex items-center gap-1.5"
        >
          <Plus class="w-3.5 h-3.5" />
          Add Status
        </button>
      </div>
    </CollapsibleSection>

    <!-- Tags Management Section -->
    <CollapsibleSection label="Thread Tags" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Manage the tags available for organizing threads
      </p>
      <div class="space-y-3"  data-onboarding-id="settings-thread-tags">
        <div
          v-for="(tag, index) in tags"
          :key="`tag-${index}`"
          class="group flex items-center gap-3"
        >
          <!-- Color Picker -->
          <div class="relative">
            <button
              @click="togglePicker(`tag:${index}`)"
              class="w-8 h-8 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
              :style="{ backgroundColor: tag.color || '#6B7280' }"
              title="Change color"
            />
            <!-- Simple color picker dropdown -->
            <div
              v-if="activePicker === `tag:${index}`"
              class="absolute z-10 top-10 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1"
            >
              <button
                v-for="color in colorOptions"
                :key="color"
                @click="tags[index].color = color; closePicker(); saveTags()"
                class="w-7 h-7 rounded hover:scale-110 transition-transform"
                :style="{ backgroundColor: color }"
              />
            </div>
          </div>

          <!-- Tag Name -->
          <input
            v-model="tag.name"
            type="text"
            placeholder="Tag name"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            @input="debouncedSaveTags"
          />

          <!-- Remove Button -->
          <button
            @click="removeTag(index)"
            class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
            :disabled="tags.length <= 1"
            title="Remove tag"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Add Tag Button -->
        <button
          @click="addTag"
          class="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-all flex items-center gap-1.5"
        >
          <Plus class="w-3.5 h-3.5" />
          Add Tag
        </button>
      </div>
    </CollapsibleSection>

    <!-- Chat State Indicators Section -->
    <CollapsibleSection label="Chat State Indicators" :default-open="false" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Customize the colors and labels for chat activity states
      </p>
      <div class="space-y-3">
        <div
          v-for="(cs, index) in chatStateConfigs"
          :key="cs.id"
          class="group flex items-center gap-3"
        >
          <!-- Color Picker -->
          <div class="relative">
            <button
              @click="togglePicker(`chatState:${index}`)"
              class="w-8 h-8 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
              :style="{ backgroundColor: cs.color }"
              title="Change color"
            />
            <div
              v-if="activePicker === `chatState:${index}`"
              class="absolute z-10 top-10 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1"
            >
              <button
                v-for="color in colorOptions"
                :key="color"
                @click="cs.color = color; closePicker(); saveChatStates()"
                class="w-7 h-7 rounded hover:scale-110 transition-transform"
                :style="{ backgroundColor: color }"
              />
            </div>
          </div>

          <!-- Label -->
          <input
            v-model="cs.label"
            type="text"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            @input="debouncedSaveChatStates"
          />

          <!-- Colorful toggle (radio-style: only one active) -->
          <button
            @click="setChatStateColorful(index)"
            class="px-3 py-2 rounded-lg border transition-all text-xs"
            :class="cs.colorful
              ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
              : 'border-neutral-700/50 bg-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600'"
            title="Animated indicator"
          >
            ✦
          </button>

          <!-- State ID badge (read-only) -->
          <span class="text-xs text-neutral-600 w-16 text-right font-mono">{{ cs.id }}</span>
        </div>
      </div>
    </CollapsibleSection>

    <!-- Display Options Section -->
    <div class="border-t border-neutral-800 pt-8">
      <CollapsibleSection label="Display Options" :default-open="true">
        <p class="text-sm text-neutral-500 mb-4">
          Configure how threads are displayed in the list
        </p>
        <div class="space-y-4">
          <div class="flex items-start gap-3">
            <input
              id="show-root-threads"
              v-model="showOnlyRootThreads"
              type="checkbox"
              class="mt-1 w-4 h-4 bg-neutral-800 border border-neutral-700 rounded text-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-0 focus:ring-offset-neutral-900"
              @change="saveDisplayOptions"
            />
            <div class="flex-1">
              <label for="show-root-threads" class="block text-sm font-medium text-neutral-200 cursor-pointer">
                Show only root threads
              </label>
              <p class="mt-1 text-xs text-neutral-500">
                When enabled, only threads without parent threads will be shown in the main list. Child threads will still be accessible from their parent threads.
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <input
              id="click-to-chat"
              v-model="clickToChat"
              type="checkbox"
              class="mt-1 w-4 h-4 bg-neutral-800 border border-neutral-700 rounded text-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-0 focus:ring-offset-neutral-900"
              @change="saveClickToChat"
            />
            <div class="flex-1">
              <label for="click-to-chat" class="block text-sm font-medium text-neutral-200 cursor-pointer">
                Click to open chat
              </label>
              <p class="mt-1 text-xs text-neutral-500">
                When enabled, clicking a thread row opens the chat view instead of the detail view.
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>

    <!-- Import Threads Section -->
    <div class="border-t border-neutral-800 pt-8">
      <CollapsibleSection label="Import Threads" :default-open="true" class="mb-8">
        <p class="text-sm text-neutral-500 mb-4">
          Import threads from an export folder
        </p>

        <div class="space-y-4">
          <button
            @click="selectAndImportThreads"
            :disabled="isImporting"
            class="px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 text-sm font-medium hover:bg-neutral-700 hover:border-neutral-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload class="w-4 h-4" />
            {{ isImporting ? 'Importing...' : 'Select Export Folder...' }}
          </button>

          <!-- Success message -->
          <div v-if="importStatus === 'success'" class="p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg">
            <div class="flex items-start gap-3">
              <CheckCircle class="w-5 h-5 text-emerald-500 mt-0.5" />
              <div class="flex-1">
                <h4 class="text-sm font-medium text-emerald-400 mb-1">
                  Successfully imported {{ importedCount }} thread{{ importedCount !== 1 ? 's' : '' }}
                </h4>
                <ul v-if="importErrors.length" class="text-sm text-neutral-400 list-disc list-inside">
                  <li v-for="(error, idx) in importErrors" :key="idx">{{ error }}</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="importStatus === 'error'" class="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
            <div class="flex items-start gap-3">
              <XCircle class="w-5 h-5 text-red-500 mt-0.5" />
              <div class="flex-1">
                <h4 class="text-sm font-medium text-red-400 mb-1">
                  Import failed
                </h4>
                <ul class="text-sm text-neutral-400 list-disc list-inside">
                  <li v-for="(error, idx) in importErrors" :key="idx">{{ error }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>

    <!-- Export Threads Section -->
    <div class="border-t border-neutral-800 pt-8">
      <CollapsibleSection label="Export Threads" :default-open="false" class="mb-8">
        <p class="text-sm text-neutral-500 mb-4">
          Export all threads with messages and relations to a JSON file
        </p>

        <div class="space-y-4">
          <!-- Directory picker row -->
          <div class="flex items-center gap-2">
            <input
              type="text"
              :value="exportDirectory"
              readonly
              placeholder="Select output directory..."
              class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white text-sm focus:outline-none cursor-default placeholder-neutral-500"
            />
            <button
              @click="selectExportDirectory"
              class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 text-sm hover:bg-neutral-700 hover:border-neutral-600 hover:text-white transition-all flex items-center gap-1.5"
            >
              <FolderOpen class="w-4 h-4" />
              Browse
            </button>
          </div>

          <!-- Export button -->
          <button
            @click="exportThreadsToFile"
            :disabled="isExporting || !exportDirectory"
            class="px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 text-sm font-medium hover:bg-neutral-700 hover:border-neutral-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download class="w-4 h-4" />
            {{ isExporting ? 'Exporting...' : 'Export' }}
          </button>

          <!-- Success message -->
          <div v-if="exportStatus === 'success'" class="p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg">
            <div class="flex items-start gap-3">
              <CheckCircle class="w-5 h-5 text-emerald-500 mt-0.5" />
              <div class="flex-1">
                <h4 class="text-sm font-medium text-emerald-400 mb-1">
                  Successfully exported {{ exportedThreadCount }} thread{{ exportedThreadCount !== 1 ? 's' : '' }}
                </h4>
                <p class="text-sm text-neutral-400">{{ exportedFilePath }}</p>
              </div>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="exportStatus === 'error'" class="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
            <div class="flex items-start gap-3">
              <XCircle class="w-5 h-5 text-red-500 mt-0.5" />
              <div class="flex-1">
                <h4 class="text-sm font-medium text-red-400 mb-1">
                  Export failed
                </h4>
                <ul class="text-sm text-neutral-400 list-disc list-inside">
                  <li v-for="(error, idx) in exportErrors" :key="idx">{{ error }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X, Upload, Download, FolderOpen, CheckCircle, XCircle } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id } from './state'
import type { ThreadsSettings, ThreadStatusOption, ThreadTagOption, ChatStateConfig } from '@app/api'

interface Props {
  settings?: ThreadsSettings
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

// State - initialize directly from props with defaults
const statuses = ref<ThreadStatusOption[]>(
  props.settings?.statuses ? [...props.settings.statuses] : []
)

const tags = ref<ThreadTagOption[]>(
  props.settings?.tags ? [...props.settings.tags] : []
)

const chatStateConfigs = ref<ChatStateConfig[]>(
  props.settings?.chatStates ? props.settings.chatStates.map(s => ({ ...s })) : []
)

const showOnlyRootThreads = ref(props.settings?.showOnlyRootThreads || false)
const clickToChat = ref(props.settings?.clickToChat || false)

// Color picker state — single ref keyed by "section:index"
const activePicker = ref<string | null>(null)
const togglePicker = (key: string) => { activePicker.value = activePicker.value === key ? null : key }
const closePicker = () => { activePicker.value = null }

// Available colors for status
const colorOptions = [
  '#6B7280', // Gray
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#84CC16', // Lime
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#78716C', // Stone
]

// Close color picker when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.relative')) closePicker()
  })
}

// Save functions
const saveStatuses = () => {
  emit('update-setting', {
    path: ['statuses'],
    value: statuses.value
  })
}

const saveTags = () => {
  emit('update-setting', {
    path: ['tags'],
    value: tags.value
  })
}

const saveChatStates = () => {
  emit('update-setting', {
    path: ['chatStates'],
    value: chatStateConfigs.value
  })
}

const setChatStateColorful = (index: number) => {
  chatStateConfigs.value.forEach((cs, i) => { cs.colorful = i === index })
  saveChatStates()
}

const saveDisplayOptions = () => {
  emit('update-setting', {
    path: ['showOnlyRootThreads'],
    value: showOnlyRootThreads.value
  })
}

const saveClickToChat = () => {
  emit('update-setting', {
    path: ['clickToChat'],
    value: clickToChat.value
  })
}

// Use the debounce composable for text input
const { debounced: debouncedSave } = useDebounce(() => {
  saveStatuses()
}, 500)

const { debounced: debouncedSaveTags } = useDebounce(() => {
  saveTags()
}, 500)

const { debounced: debouncedSaveChatStates } = useDebounce(() => {
  saveChatStates()
}, 500)

// Status management
const addStatus = () => {
  const newStatus: ThreadStatusOption = {
    label: `New Status ${Date.now()}`,
    color: colorOptions[statuses.value.length % colorOptions.length]
  }
  statuses.value.push(newStatus)
  saveStatuses()
}

const removeStatus = (index: number) => {
  if (statuses.value.length > 1) {
    statuses.value.splice(index, 1)
    saveStatuses()
  }
}

// Tag management
const addTag = () => {
  const newTag: ThreadTagOption = {
    name: `New Tag ${Date.now()}`,
    color: colorOptions[tags.value.length % colorOptions.length]
  }
  tags.value.push(newTag)
  saveTags()
}

const removeTag = (index: number) => {
  if (tags.value.length > 1) {
    tags.value.splice(index, 1)
    saveTags()
  }
}

// Get threads actor for import/export state
const threadsActor = applicationState.system.get(id)

// Import state
const isImporting = useSelector(threadsActor, (state: any) => state.context.threadsImport.status === 'importing')
const importStatus = useSelector(threadsActor, (state: any) => state.context.threadsImport.status)
const importErrors = useSelector(threadsActor, (state: any) => state.context.threadsImport.errors)
const importedCount = useSelector(threadsActor, (state: any) => state.context.threadsImport.importedCount)

// Export state
const exportDirectory = ref<string>('')
const isExporting = useSelector(threadsActor, (state: any) => state.context.threadsExport.status === 'exporting')
const exportStatus = useSelector(threadsActor, (state: any) => state.context.threadsExport.status)
const exportErrors = useSelector(threadsActor, (state: any) => state.context.threadsExport.errors)
const exportedFilePath = useSelector(threadsActor, (state: any) => state.context.threadsExport.filePath)
const exportedThreadCount = useSelector(threadsActor, (state: any) => state.context.threadsExport.threadCount)

// Import - directory picker and send to state machine
const selectAndImportThreads = async () => {
  threadsActor.send({ type: 'THREADS.RESET_IMPORT_STATUS' })

  const directory = await window.electronAPI?.fileUtils.selectPath({
    type: 'directory'
  })

  if (!directory || Array.isArray(directory)) return

  threadsActor.send({
    type: 'THREADS.IMPORT',
    directory,
  })
}

// Export
const selectExportDirectory = async () => {
  const dir = await window.electronAPI?.fileUtils.selectPath({ type: 'directory' })
  if (dir && typeof dir === 'string') exportDirectory.value = dir
}

const exportThreadsToFile = () => {
  if (!exportDirectory.value) return
  threadsActor.send({ type: 'THREADS.RESET_EXPORT_STATUS' })
  threadsActor.send({ type: 'THREADS.EXPORT', directory: exportDirectory.value })
}
</script>
