<template>
  <div class="file-picker-input space-y-3">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>{{ displayText || 'Selected files:' }}</span>
      </div>
      <div
        v-for="(path, index) in fileList"
        :key="index"
        class="flex items-center gap-2 px-3 py-2 bg-neutral-700/30 rounded-lg border border-neutral-600/50"
      >
        <component :is="getFileIcon(path)" class="w-4 h-4 text-neutral-400 flex-shrink-0" />
        <span class="text-sm text-neutral-300 truncate">{{ path }}</span>
      </div>
      <!-- Show toggle states in response display -->
      <div v-if="responseToggles" class="flex items-center gap-3 pt-1">
        <span
          v-for="(value, id) in responseToggles"
          :key="String(id)"
          class="text-xs text-neutral-500"
        >
          {{ toggleLabel(String(id)) }}: <span :class="value ? 'text-green-500' : 'text-neutral-400'">{{ value ? 'On' : 'Off' }}</span>
        </span>
      </div>
    </div>

    <!-- Input Controls (when not disabled/not responded) -->
    <template v-else>
      <!-- Selected Files Display -->
      <div v-if="selectedPaths.length > 0" class="space-y-2">
        <div
          v-for="(path, index) in selectedPaths"
          :key="index"
          class="flex items-center gap-2 px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600"
        >
          <component :is="getFileIcon(path)" class="w-4 h-4 text-neutral-400 flex-shrink-0" />
          <span class="text-sm text-neutral-200 truncate flex-1">{{ path }}</span>
          <button
            @click="removePath(index)"
            :disabled="disabled || isLoading"
            :class="[
              'p-1 rounded transition-colors',
              disabled || isLoading
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-neutral-600'
            ]"
            title="Remove"
          >
            <X class="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      <!-- File Picker Controls -->
      <div class="flex items-center gap-2">
        <button
          @click="openFileDialog"
          :disabled="disabled || isLoading"
          :class="[
            'px-4 py-2 rounded-lg border border-neutral-600 transition-colors text-sm flex items-center gap-2',
            disabled || isLoading
              ? 'bg-neutral-700/50 text-neutral-500 cursor-not-allowed opacity-50'
              : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
          ]"
        >
          <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
          <FolderOpen v-else class="w-4 h-4" />
          {{ isLoading ? 'Processing...' : browseButtonText }}
        </button>
      </div>

      <!-- Toggles (optional, rendered below browse button) -->
      <div v-if="toggles?.length" class="space-y-1.5 pt-1">
        <div
          v-for="toggle in toggles"
          :key="toggle.id"
          class="flex items-center gap-2.5"
        >
          <button
            type="button"
            @click="toggleValues[toggle.id] = !toggleValues[toggle.id]"
            :class="[
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0',
              toggleValues[toggle.id]
                ? 'bg-blue-600'
                : 'bg-neutral-600',
            ]"
          >
            <span
              :class="[
                'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform',
                toggleValues[toggle.id] ? 'left-[16px]' : 'left-[2px]',
              ]"
            />
          </button>
          <span class="text-sm text-neutral-300">{{ toggle.label }}</span>
          <span v-if="toggle.description" class="text-xs text-neutral-500">{{ toggle.description }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FolderOpen, File, Folder, X, Check, Loader2 } from 'lucide-vue-next'

interface ToggleConfig {
  id: string
  label: string
  description?: string
  default?: boolean
}

interface Props {
  fileType?: 'file' | 'directory' | 'both'
  allowMultiple?: boolean
  modelValue?: string | string[]
  disabled?: boolean
  response?: any
  displayText?: string
  toggles?: ToggleConfig[]
}

interface Emits {
  (e: 'update:modelValue', value: string | string[]): void
  (e: 'submit', value: string | string[]): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  fileType: 'both',
  allowMultiple: false,
  disabled: false
})

const emit = defineEmits<Emits>()

// Internal loading state
const isLoading = ref(false)

// Toggle state
const toggleValues = ref<Record<string, boolean>>({})
watch(() => props.toggles, (t) => {
  if (t) t.forEach(tog => { toggleValues.value[tog.id] ??= tog.default ?? false })
}, { immediate: true })

const toggleLabel = (id: string) => props.toggles?.find(t => t.id === id)?.label ?? id

// Response display handling — supports both string and { path, toggles } shapes
const fileList = computed(() => {
  const r = props.response
  if (!r) return []
  if (typeof r === 'string') return [r]
  if (Array.isArray(r)) return r
  if (r.path) return Array.isArray(r.path) ? r.path : [r.path]
  return []
})

const responseToggles = computed(() => {
  const r = props.response
  return r && typeof r === 'object' && !Array.isArray(r) && r.toggles ? r.toggles : null
})

// Initialize from modelValue
const selectedPaths = ref<string[]>(
  props.modelValue
    ? (Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue])
    : []
)

// Computed current value (single string or array based on allowMultiple)
const currentValue = computed(() => {
  return props.allowMultiple
    ? selectedPaths.value
    : selectedPaths.value[0] || ''
})

const browseButtonText = computed(() => {
  const typeText = props.fileType === 'file' ? 'File' :
                  props.fileType === 'directory' ? 'Directory' :
                  'File/Directory';
  return `Browse ${typeText}${props.allowMultiple ? 's' : ''}`;
})

const getFileIcon = (path: string) => {
  // Simple heuristic: if path has an extension, it's likely a file
  const hasExtension = /\.[^/.]+$/.test(path);
  return hasExtension ? File : Folder;
}

const openFileDialog = async () => {
  if (props.disabled || isLoading.value) return;

  try {
    // Use native Electron dialog for file/directory selection
    const result = await window.electronAPI?.fileUtils.selectPath({
      type: props.fileType || 'file',
      allowMultiple: props.allowMultiple
    });

    if (!result) return; // User cancelled

    const newPaths = Array.isArray(result) ? result : [result];

    if (props.allowMultiple) {
      selectedPaths.value = [...selectedPaths.value, ...newPaths];
    } else {
      selectedPaths.value = newPaths.slice(0, 1);
    }

    emitUpdate();

    // Set loading state before submitting
    isLoading.value = true;

    // Auto-submit after file selection
    if (selectedPaths.value.length > 0) {
      if (props.toggles?.length) {
        emit('submit', { path: currentValue.value, toggles: { ...toggleValues.value } } as any)
      } else {
        emit('submit', currentValue.value)
      }
    }
  } catch (error) {
    console.error('Error opening file dialog:', error);
  }
}

const removePath = (index: number) => {
  selectedPaths.value.splice(index, 1);
  emitUpdate();
}

// Clear loading state when disabled (backend responded)
watch(() => props.disabled, (newDisabled) => {
  if (newDisabled) {
    isLoading.value = false;
  }
})

const emitUpdate = () => {
  emit('update:modelValue', currentValue.value);
}
</script>
