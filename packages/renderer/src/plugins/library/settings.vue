<template>
  <div class="max-w-3xl">
    <!-- Tags Management Section -->
    <CollapsibleSection label="Document Tags" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Manage the tags available for organizing documents
      </p>
      <div class="space-y-3">
        <div
          v-for="(tag, index) in tags"
          :key="`tag-${index}`"
          class="group flex items-center gap-3"
        >
          <!-- Color Picker -->
          <div class="relative">
            <button
              @click="toggleColorPicker(index)"
              class="w-8 h-8 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
              :style="{ backgroundColor: tag.color || '#6B7280' }"
              title="Change color"
            />
            <!-- Simple color picker dropdown -->
            <div
              v-if="activeColorPicker === index"
              class="absolute z-10 top-10 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1"
            >
              <button
                v-for="color in colorOptions"
                :key="color"
                @click="updateTagColor(index, color)"
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
            @input="debouncedSave"
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

    <!-- Import Library Section -->
    <CollapsibleSection label="Import Library" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Import library items from an exported JSON file
      </p>

      <div class="space-y-4">
        <button
          @click="selectAndImportLibrary"
          :disabled="isImporting"
          class="px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 text-sm font-medium hover:bg-neutral-700 hover:border-neutral-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload class="w-4 h-4" />
          {{ isImporting ? 'Importing...' : 'Select JSON File...' }}
        </button>

        <!-- Success message -->
        <div v-if="importStatus === 'success'" class="p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg">
          <div class="flex items-start gap-3">
            <CheckCircle class="w-5 h-5 text-emerald-500 mt-0.5" />
            <div class="flex-1">
              <h4 class="text-sm font-medium text-emerald-400 mb-1">
                Successfully imported {{ importedCount }} item{{ importedCount !== 1 ? 's' : '' }}
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

    <!-- Export Library Section -->
    <CollapsibleSection label="Export Library" :default-open="false" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Export all library items to a JSON file
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
          @click="exportLibraryToFile"
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
                Successfully exported {{ exportedItemCount }} item{{ exportedItemCount !== 1 ? 's' : '' }}
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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X, Upload, Download, FolderOpen, CheckCircle, XCircle } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id } from './state'

interface LibraryTagOption {
  name: string
  color?: string
}

interface LibrarySettings {
  tags?: LibraryTagOption[]
}

interface Props {
  settings?: LibrarySettings
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
const tags = ref<LibraryTagOption[]>(
  props.settings?.tags ? [...props.settings.tags] : []
)

// Color picker state
const activeColorPicker = ref<number | null>(null)

// Available colors
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

// Color picker management
const toggleColorPicker = (index: number) => {
  activeColorPicker.value = activeColorPicker.value === index ? null : index
}

const updateTagColor = (index: number, color: string) => {
  tags.value[index].color = color
  activeColorPicker.value = null
  saveTags()
}

// Close color picker when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.relative')) {
      activeColorPicker.value = null
    }
  })
}

// Save function
const saveTags = () => {
  emit('update-setting', {
    path: ['tags'],
    value: tags.value
  })
}

// Use the debounce composable for text input
const { debounced: debouncedSave } = useDebounce(() => {
  saveTags()
}, 500)

// Tag management
const addTag = () => {
  const newTag: LibraryTagOption = {
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

// Get library actor and state via selectors
const libraryActor = applicationState.system.get(id)

// Import state
const isImporting = useSelector(libraryActor, (state: any) => state.context.libraryImport.status === 'importing')
const importStatus = useSelector(libraryActor, (state: any) => state.context.libraryImport.status)
const importErrors = useSelector(libraryActor, (state: any) => state.context.libraryImport.errors)
const importedCount = useSelector(libraryActor, (state: any) => state.context.libraryImport.importedCount)

// Export state
const exportDirectory = ref<string>('')
const isExporting = useSelector(libraryActor, (state: any) => state.context.libraryExport.status === 'exporting')
const exportStatus = useSelector(libraryActor, (state: any) => state.context.libraryExport.status)
const exportErrors = useSelector(libraryActor, (state: any) => state.context.libraryExport.errors)
const exportedFilePath = useSelector(libraryActor, (state: any) => state.context.libraryExport.filePath)
const exportedItemCount = useSelector(libraryActor, (state: any) => state.context.libraryExport.itemCount)

// Import - file picker and send to state machine
const selectAndImportLibrary = async () => {
  libraryActor.send({ type: 'LIBRARY.RESET_IMPORT_STATUS' })

  const filePath = await window.electronAPI?.fileUtils.selectPath({
    type: 'file'
  })

  if (!filePath || Array.isArray(filePath)) return

  if (!filePath.endsWith('.json')) return

  try {
    const content = await window.electronAPI?.fileUtils.readFile(filePath)
    if (!content) return

    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      return
    }

    // Support both { version, items } wrapper and raw array
    const items = Array.isArray(parsed) ? parsed : parsed?.items
    if (!Array.isArray(items)) return

    libraryActor.send({
      type: 'LIBRARY.IMPORT',
      items,
    })
  } catch {
    // Silently fail for file reading errors
  }
}

// Export
const selectExportDirectory = async () => {
  const dir = await window.electronAPI?.fileUtils.selectPath({ type: 'directory' })
  if (dir && typeof dir === 'string') exportDirectory.value = dir
}

const exportLibraryToFile = () => {
  if (!exportDirectory.value) return
  libraryActor.send({ type: 'LIBRARY.RESET_EXPORT_STATUS' })
  libraryActor.send({ type: 'LIBRARY.EXPORT', directory: exportDirectory.value })
}
</script>
