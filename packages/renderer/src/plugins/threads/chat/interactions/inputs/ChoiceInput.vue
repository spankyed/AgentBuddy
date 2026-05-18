<template>
  <div class="choice-input space-y-3">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>{{ displayText || 'Selected:' }}</span>
      </div>
      <div class="px-3 py-2 bg-primary-600/15 rounded-lg border border-primary-600/30">
        <span class="text-sm text-primary-400">{{ choiceText }}</span>
      </div>
    </div>

    <!-- Input Controls (when not disabled/not responded) -->
    <template v-else>
      <!-- Choices -->
    <div class="space-y-2" :class="compact ? 'max-h-40 overflow-y-auto' : ''">
      <div
        v-for="choice in choices"
        :key="choice.id"
        @click="!disabled && toggleChoice(choice.id)"
        :class="[
          'px-4 py-3 rounded-lg border transition-all duration-200',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer',
          isSelected(choice.id)
            ? 'bg-primary-600/20 border-primary-600 ring-2 ring-primary-600/50'
            : disabled
              ? 'bg-neutral-700/30 border-neutral-700'
              : 'bg-neutral-700/50 border-neutral-600 hover:border-neutral-500'
        ]"
      >
        <div class="flex items-start gap-3">
          <!-- Radio/Checkbox Icon -->
          <div
            :class="[
              'flex-shrink-0 w-5 h-5 rounded transition-all',
              multiSelect ? 'rounded-md' : 'rounded-full',
              isSelected(choice.id)
                ? 'bg-primary-600 border-2 border-primary-600'
                : 'bg-neutral-600 border-2 border-neutral-500'
            ]"
          >
            <div
              v-if="isSelected(choice.id)"
              class="w-full h-full flex items-center justify-center"
            >
              <Check class="w-3 h-3 text-white" />
            </div>
          </div>

          <!-- Choice Content -->
          <div class="flex-1 min-w-0" :class="compact ? 'flex items-center gap-2' : ''">
            <div class="text-sm font-medium text-neutral-200 shrink-0">
              {{ choice.label }}
            </div>
            <div v-if="choice.description" :class="compact ? 'text-xs text-neutral-500 truncate' : 'text-xs text-neutral-400 mt-1'">
              {{ choice.description }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Skip text link (single-select only — multi-select uses the action button) -->
    <div v-if="skipOption && !multiSelect && !disabled" class="pt-1">
      <button
        @click="handleSkip"
        class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors duration-200"
      >
        {{ skipOption.label }}
      </button>
    </div>

    <!-- Custom Input (if allowed) -->
    <div v-if="allowCustom" class="space-y-2">
      <div class="text-xs text-neutral-400">Or enter custom response:</div>
      <textarea
        v-model="customInput"
        rows="1"
        :disabled="disabled"
        placeholder="Type your custom response..."
        :class="[
          'w-full px-3 py-2 border rounded-lg text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none max-h-32 overflow-y-auto',
          disabled
            ? 'bg-neutral-700/50 border-neutral-700 text-neutral-500 cursor-not-allowed'
            : 'bg-neutral-700 border-neutral-600 text-neutral-200'
        ]"
        @keydown="onCustomKeydown"
        @input="autoResize"
      />
    </div>

      <!-- Action Buttons (only for multi-select) -->
      <ActionButtons
        v-if="multiSelect"
        :buttons="['submit', 'cancel']"
        :submit-disabled="!canSubmit || disabled"
        :cancel-label="skipOption ? skipOption.label : 'Cancel'"
        @submit="submitResponse"
        @cancel="skipOption ? handleSkip() : $emit('cancel')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check } from 'lucide-vue-next'
import ActionButtons from '../blocks/ActionButtons.vue'

interface Choice {
  id: string
  label: string
  description?: string
}

interface Props {
  choices: Choice[]
  multiSelect?: boolean
  allowCustom?: boolean
  compact?: boolean
  skipOption?: { id: string; label: string }
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
  multiSelect: false,
  allowCustom: false,
  compact: false,
  disabled: false,
})

const emit = defineEmits<Emits>()

// Response display handling
const choiceText = computed(() => {
  if (!props.response) return ''
  if (typeof props.response === 'object' && !Array.isArray(props.response)) {
    if (props.response.cancelled) return 'Skipped'
    return props.response.value ?? JSON.stringify(props.response)
  }
  if (Array.isArray(props.response)) return props.response.join(', ')
  return String(props.response)
})

// Initialize from modelValue
const selectedChoiceIds = ref<string[]>(
  props.modelValue
    ? (Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue])
    : []
)

const customInput = ref('')

const isSelected = (choiceId: string): boolean => {
  return selectedChoiceIds.value.includes(choiceId)
}

const toggleChoice = (choiceId: string) => {
  if (props.multiSelect) {
    const index = selectedChoiceIds.value.indexOf(choiceId)
    if (index > -1) {
      selectedChoiceIds.value.splice(index, 1)
    } else {
      selectedChoiceIds.value.push(choiceId)
    }
  } else {
    selectedChoiceIds.value = [choiceId]
  }
  // Clear custom input when selecting a choice
  customInput.value = ''
  emitUpdate()

  // Auto-submit for single-select (not multi-select)
  if (!props.multiSelect && !props.disabled) {
    submitResponse()
  }
}

const canSubmit = computed(() => {
  return selectedChoiceIds.value.length > 0 || (props.allowCustom && customInput.value.trim().length > 0)
})

const submitResponse = () => {
  if (!canSubmit.value) return

  let response: string | string[]

  if (customInput.value.trim()) {
    // Custom input takes precedence
    response = customInput.value.trim()
  } else if (props.multiSelect) {
    response = selectedChoiceIds.value
  } else {
    response = selectedChoiceIds.value[0] || ''
  }

  emit('submit', response)
}

const onCustomKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!props.disabled) submitResponse()
  }
}

const autoResize = (e: Event) => {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const handleSkip = () => {
  if (props.skipOption) {
    emit('submit', props.skipOption.id)
  }
}

const emitUpdate = () => {
  let value: string | string[]

  if (props.multiSelect) {
    value = selectedChoiceIds.value
  } else {
    value = selectedChoiceIds.value[0] || ''
  }

  emit('update:modelValue', value)
}
</script>
