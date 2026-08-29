<template>
  <div class="max-w-3xl">
    <CollapsibleSection label="Notes" :default-open="true" class="mb-8">
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <label for="show-collapse-icon" class="text-sm font-medium text-neutral-300">
              Show collapse icon
            </label>
            <p class="text-xs text-neutral-500 mt-0.5">
              Show a collapse chevron in place of a note's icon for notes with children
            </p>
          </div>
          <input
            id="show-collapse-icon"
            v-model="showCollapseIcon"
            type="checkbox"
            @change="saveShowCollapseIconSetting"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection label="Task List" :default-open="true" class="mb-8">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-neutral-300 min-w-[120px]">
            Panel Position:
          </label>
          <div class="flex gap-1">
            <button
              v-for="option in positionOptions"
              :key="option.value"
              @click="updatePosition(option.value)"
              :class="[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                panelPosition === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 border border-neutral-700/50'
              ]"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </CollapsibleSection>

    <!-- Import Notes Section -->
    <CollapsibleSection label="Import Notes" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Import notes from an export folder
      </p>

      <div class="space-y-4">
        <button
          @click="selectAndImportNotes"
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
                Successfully imported {{ importedCount }} note{{ importedCount !== 1 ? 's' : '' }}
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

    <!-- Export Notes Section -->
    <CollapsibleSection label="Export Notes" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        {{ exportFormat === 'markdown'
          ? 'Export notes as markdown files with frontmatter'
          : 'Export all notes to a JSON file (full-fidelity round-trip)'
        }}
      </p>

      <div class="space-y-4">
        <!-- Format toggle -->
        <div class="flex items-center gap-1 p-1 bg-neutral-800 rounded-lg w-fit">
          <button
            @click="exportFormat = 'markdown'"
            :class="[
              'px-3 py-1.5 text-sm rounded-md transition-all',
              exportFormat === 'markdown'
                ? 'bg-neutral-700 text-white font-medium'
                : 'text-neutral-400 hover:text-neutral-300'
            ]"
          >
            Markdown
          </button>
          <button
            @click="exportFormat = 'json'"
            :class="[
              'px-3 py-1.5 text-sm rounded-md transition-all',
              exportFormat === 'json'
                ? 'bg-neutral-700 text-white font-medium'
                : 'text-neutral-400 hover:text-neutral-300'
            ]"
          >
            JSON
          </button>
        </div>

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
          @click="exportNotesToFile"
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
                Successfully exported {{ exportedItemCount }} note{{ exportedItemCount !== 1 ? 's' : '' }}
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
import { ref, watch } from 'vue'
import { Upload, Download, FolderOpen, CheckCircle, XCircle } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id } from './state'

interface NotesSettings {
  tasklistPanelPosition: 'left' | 'right'
  showCollapseIcon: boolean
}

interface Props {
  settings?: NotesSettings
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

const positionOptions = [
  { value: 'left' as const, label: 'Left' },
  { value: 'right' as const, label: 'Right' },
]

const panelPosition = ref<'left' | 'right'>(props.settings?.tasklistPanelPosition || 'left')
const showCollapseIcon = ref(props.settings?.showCollapseIcon ?? false)

watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    panelPosition.value = newSettings.tasklistPanelPosition
    showCollapseIcon.value = newSettings.showCollapseIcon ?? false
  }
}, { deep: true })

const saveShowCollapseIconSetting = () => {
  emit('update-setting', {
    path: ['showCollapseIcon'],
    value: showCollapseIcon.value
  })
}

const updatePosition = (value: 'left' | 'right') => {
  panelPosition.value = value
  emit('update-setting', {
    path: ['tasklistPanelPosition'],
    value
  })
}

// Get notes actor and state via selectors
const notesActor = applicationState.system.get(id)

// Import state
const isImporting = useSelector(notesActor, (state: any) => state.context.notesImport.status === 'importing')
const importStatus = useSelector(notesActor, (state: any) => state.context.notesImport.status)
const importErrors = useSelector(notesActor, (state: any) => state.context.notesImport.errors)
const importedCount = useSelector(notesActor, (state: any) => state.context.notesImport.importedCount)

// Export state
const exportFormat = ref<'markdown' | 'json'>('markdown')
const exportDirectory = ref<string>('')
const isExporting = useSelector(notesActor, (state: any) => state.context.notesExport.status === 'exporting')
const exportStatus = useSelector(notesActor, (state: any) => state.context.notesExport.status)
const exportErrors = useSelector(notesActor, (state: any) => state.context.notesExport.errors)
const exportedFilePath = useSelector(notesActor, (state: any) => state.context.notesExport.filePath)
const exportedItemCount = useSelector(notesActor, (state: any) => state.context.notesExport.itemCount)

// Import - directory picker and send to state machine
const selectAndImportNotes = async () => {
  notesActor.send({ type: 'NOTES.RESET_IMPORT_STATUS' })

  const directory = await window.electronAPI?.fileUtils.selectPath({
    type: 'directory'
  })

  if (!directory || Array.isArray(directory)) return

  notesActor.send({
    type: 'NOTES.IMPORT',
    directory,
  })
}

// Export
const selectExportDirectory = async () => {
  const dir = await window.electronAPI?.fileUtils.selectPath({ type: 'directory' })
  if (dir && typeof dir === 'string') exportDirectory.value = dir
}

const exportNotesToFile = () => {
  if (!exportDirectory.value) return
  notesActor.send({ type: 'NOTES.RESET_EXPORT_STATUS' })
  notesActor.send({ type: 'NOTES.EXPORT', directory: exportDirectory.value, format: exportFormat.value })
}
</script>
