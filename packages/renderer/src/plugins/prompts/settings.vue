<template>
  <div class="max-w-3xl">
    <!-- Prompt Categories Section -->
    <CollapsibleSection label="Prompt Categories" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Organize your prompts into categories with custom colors for easy identification
      </p>
      <div class="space-y-4">
        <div 
          v-for="(category, index) in categories" 
          :key="index"
          class="group"
        >
          <div class="flex items-center gap-3">
            <!-- Color picker -->
            <ColorPicker
              v-model="category.color"
              @change="debouncedSave"
            />
            
            <!-- Category name input -->
            <input
              v-model="category.name"
              type="text"
              placeholder="Category name"
              class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            
            <!-- Remove button -->
            <button
              @click="removeCategory(index)"
              class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
              :disabled="categories.length <= 1"
              title="Remove category"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Add category button -->
        <button
          @click="addCategory"
          class="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-all flex items-center gap-1.5"
        >
          <Plus class="w-3.5 h-3.5" />
          Add Category
        </button>
      </div>
    </CollapsibleSection>

    <!-- Import Prompts Section -->
    <CollapsibleSection label="Import Prompts" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Import prompts from an exported JSON file
      </p>

      <div class="space-y-4">
        <button
          @click="selectAndImportPrompts"
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
                Successfully imported {{ importedCount }} prompt{{ importedCount !== 1 ? 's' : '' }}
              </h4>
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

    <!-- Export Prompts Section -->
    <CollapsibleSection label="Export Prompts" :default-open="false" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Export all prompts to a JSON file
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
          @click="exportPromptsToFile"
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
                Successfully exported {{ exportedPromptCount }} prompt{{ exportedPromptCount !== 1 ? 's' : '' }}
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
import ColorPicker from '@/core/components/design/ColorPicker.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import type { PromptsSettings, Category } from '@app/api'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type PromptsState } from './state'

interface Props {
  settings?: PromptsSettings
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

// State - use settings or empty array (defaults come from backend)
const categories = ref<Category[]>(
  props.settings?.categories && props.settings.categories.length > 0
    ? [...props.settings.categories]
    : []
)

// Save function
const saveCategories = () => {
  emit('update-setting', {
    path: ['categories'],
    value: categories.value
  })
}

// Use the debounce composable for saving categories
const { debounced: debouncedSave } = useDebounce(() => {
  saveCategories()
}, 500)

// Category management
const addCategory = () => {
  const newCategory: Category = {
    name: '',
    color: '#6B7280' // Default gray color
  }
  categories.value.push(newCategory)
  saveCategories()
}

const removeCategory = (index: number) => {
  if (categories.value.length > 1) {
    categories.value.splice(index, 1)
    saveCategories()
  }
}

// Get prompts actor and state via selectors
const promptsActor: PromptsState = applicationState.system.get(id)

// Import state
const isImporting = useSelector(promptsActor, (state) => state.context.promptsImport.status === 'importing')
const importStatus = useSelector(promptsActor, (state) => state.context.promptsImport.status)
const importErrors = useSelector(promptsActor, (state) => state.context.promptsImport.errors)
const importedCount = useSelector(promptsActor, (state) => state.context.promptsImport.importedCount)

// Export state
const exportDirectory = ref<string>('')
const isExporting = useSelector(promptsActor, (state) => state.context.promptsExport.status === 'exporting')
const exportStatus = useSelector(promptsActor, (state) => state.context.promptsExport.status)
const exportErrors = useSelector(promptsActor, (state) => state.context.promptsExport.errors)
const exportedFilePath = useSelector(promptsActor, (state) => state.context.promptsExport.filePath)
const exportedPromptCount = useSelector(promptsActor, (state) => state.context.promptsExport.promptCount)

// Import - file picker and send to state machine
const selectAndImportPrompts = async () => {
  promptsActor.send({ type: 'PROMPTS.RESET_IMPORT_STATUS' })

  const filePath = await window.electronAPI?.fileUtils.selectPath({
    type: 'file'
  })

  if (!filePath || Array.isArray(filePath)) return

  if (!filePath.endsWith('.json')) return

  try {
    const content = await window.electronAPI?.fileUtils.readFile(filePath)
    if (!content) return

    let prompts: any
    try {
      prompts = JSON.parse(content)
    } catch {
      return
    }

    promptsActor.send({
      type: 'PROMPTS.IMPORT',
      prompts,
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

const exportPromptsToFile = () => {
  if (!exportDirectory.value) return
  promptsActor.send({ type: 'PROMPTS.RESET_EXPORT_STATUS' })
  promptsActor.send({ type: 'PROMPTS.EXPORT', directory: exportDirectory.value })
}
</script>