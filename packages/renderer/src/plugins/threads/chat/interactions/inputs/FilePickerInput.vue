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
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FolderOpen, File, Folder, X, Check, Loader2 } from 'lucide-vue-next'

interface Props {
  fileType?: 'file' | 'directory' | 'both'
  allowMultiple?: boolean
  modelValue?: string | string[]
  disabled?: boolean
  response?: any
  displayText?: string
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

// Response display handling
const fileList = computed(() => {
  if (!props.response) return []
  if (Array.isArray(props.response)) return props.response
  if (typeof props.response === 'string') return [props.response]
  return []
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
      emit('submit', currentValue.value);
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
