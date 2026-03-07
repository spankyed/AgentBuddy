<template>
  <div class="text-input space-y-3">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>{{ displayText || 'Response submitted' }}</span>
      </div>
      <div class="px-3 py-2 bg-primary-600/15 rounded-lg border border-primary-600/30">
        <span class="text-sm text-primary-400">{{ responseText }}</span>
      </div>
    </div>

    <!-- Input Controls (when not disabled/not responded) -->
    <template v-else>
      <!-- Single-line input -->
    <input
      v-if="!multiline"
      v-model="inputValue"
      :type="inputType"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :class="[
        'w-full px-3 py-2 border rounded-lg text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent',
        disabled
          ? 'bg-neutral-700/50 border-neutral-700 text-neutral-500 cursor-not-allowed'
          : 'bg-neutral-700 border-neutral-600 text-neutral-200'
      ]"
      @keyup.enter="!disabled && handleSubmit"
    />

    <!-- Suggestion buttons -->
    <div v-if="suggestions?.length && !disabled" class="flex flex-wrap gap-2">
      <button
        v-for="text in suggestions"
        :key="text"
        class="px-3 py-1 text-sm rounded-full border border-neutral-600 text-neutral-300 hover:bg-primary-600/20 hover:border-primary-500 hover:text-primary-400 transition-colors"
        @click="selectSuggestion(text)"
      >
        {{ text }}
      </button>
    </div>

    <!-- Multi-line textarea -->
    <textarea
      v-else
      v-model="inputValue"
      :placeholder="placeholder"
      :required="required"
      :rows="rows"
      :disabled="disabled"
      :class="[
        'w-full px-3 py-2 border rounded-lg text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-y',
        disabled
          ? 'bg-neutral-700/50 border-neutral-700 text-neutral-500 cursor-not-allowed'
          : 'bg-neutral-700 border-neutral-600 text-neutral-200'
      ]"
    />

    <!-- Validation error -->
    <div v-if="showError && errorMessage" class="text-xs text-red-400">
      {{ errorMessage }}
    </div>

      <!-- Action Buttons (only for multiline) -->
      <ActionButtons
        v-if="multiline"
        :buttons="['submit', 'cancel']"
        :submit-disabled="!canSubmit || disabled"
        @submit="handleSubmit"
        @cancel="$emit('cancel')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Check } from 'lucide-vue-next'
import ActionButtons from '../blocks/ActionButtons.vue'

interface Props {
  modelValue?: string
  placeholder?: string
  multiline?: boolean
  rows?: number
  inputType?: 'text' | 'email' | 'url' | 'password'
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  customValidator?: (value: string) => string | null  // Returns error message or null
  disabled?: boolean
  response?: any
  displayText?: string
  debounceMs?: number
  suggestions?: string[]
}

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'submit', value: string): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: 'Enter text...',
  multiline: false,
  rows: 3,
  inputType: 'text',
  required: false,
  disabled: false,
  debounceMs: 500
})

const emit = defineEmits<Emits>()

const inputValue = ref(props.modelValue)
const showError = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  inputValue.value = newValue
})

// Emit updates to parent and handle auto-submit
watch(inputValue, (newValue) => {
  emit('update:modelValue', newValue)
  // Hide error when user starts typing again
  if (showError.value) {
    showError.value = false
  }

  // Auto-submit for single-line inputs (not multiline)
  if (!props.multiline && !props.disabled) {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Set new timer to auto-submit after debounce
    debounceTimer = setTimeout(() => {
      if (canSubmit.value) {
        handleSubmit()
      }
    }, props.debounceMs)
  }
})

// Response display text
const responseText = computed(() => {
  if (!props.response) return ''
  return String(props.response || '')
})

// Cleanup timer on unmount
onUnmounted(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})

const errorMessage = computed(() => {
  const value = inputValue.value.trim()

  if (props.required && value.length === 0) {
    return 'This field is required'
  }

  if (props.minLength && value.length < props.minLength) {
    return `Minimum length is ${props.minLength} characters`
  }

  if (props.maxLength && value.length > props.maxLength) {
    return `Maximum length is ${props.maxLength} characters`
  }

  if (props.pattern && !props.pattern.test(value)) {
    return 'Invalid format'
  }

  if (props.customValidator) {
    return props.customValidator(value)
  }

  return null
})

const canSubmit = computed(() => {
  const value = inputValue.value.trim()
  return value.length > 0 && errorMessage.value === null
})

const handleSubmit = () => {
  if (!canSubmit.value) {
    showError.value = true
    return
  }

  emit('submit', inputValue.value.trim())
}

const selectSuggestion = (text: string) => {
  inputValue.value = text
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  emit('submit', text)
}
</script>
