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
          class="w-full px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 hover:text-white hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
        >
          <Plus class="w-4 h-4" />
          Add Tag
        </button>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { useDebounce } from '@/core/composables/useDebounce'

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
</script>