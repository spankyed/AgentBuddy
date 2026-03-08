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
              @click="toggleColorPicker(index)"
              class="w-8 h-8 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
              :style="{ backgroundColor: status.color }"
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
                @click="updateStatusColor(index, color)"
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
              @click="toggleTagColorPicker(index)"
              class="w-8 h-8 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
              :style="{ backgroundColor: tag.color || '#6B7280' }"
              title="Change color"
            />
            <!-- Simple color picker dropdown -->
            <div 
              v-if="activeTagColorPicker === index"
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

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import type { ThreadsSettings, ThreadStatusOption, ThreadTagOption } from '@app/api'

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

const showOnlyRootThreads = ref(props.settings?.showOnlyRootThreads || false)
const clickToChat = ref(props.settings?.clickToChat || false)

// Color picker state
const activeColorPicker = ref<number | null>(null)
const activeTagColorPicker = ref<number | null>(null)

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

// Color picker management
const toggleColorPicker = (index: number) => {
  activeColorPicker.value = activeColorPicker.value === index ? null : index
}

const updateStatusColor = (index: number, color: string) => {
  statuses.value[index].color = color
  activeColorPicker.value = null
  saveStatuses()
}

// Tag color picker management
const toggleTagColorPicker = (index: number) => {
  activeTagColorPicker.value = activeTagColorPicker.value === index ? null : index
}

const updateTagColor = (index: number, color: string) => {
  tags.value[index].color = color
  activeTagColorPicker.value = null
  saveTags()
}

// Close color picker when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.relative')) {
      activeColorPicker.value = null
      activeTagColorPicker.value = null
    }
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
</script>