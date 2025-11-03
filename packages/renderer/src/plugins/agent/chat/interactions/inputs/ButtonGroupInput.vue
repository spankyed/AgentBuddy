<template>
  <div class="button-group space-y-3">
    <!-- Response Display (when disabled and not keepInteractive) -->
    <div v-if="isDisabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>{{ responseMessage }}</span>
      </div>
      <div class="px-3 py-2 bg-primary-600/15 rounded-lg border border-primary-600/30">
        <span class="text-sm text-primary-400">{{ responseText }}</span>
      </div>
    </div>

    <!-- Button Controls -->
    <div v-else class="flex flex-wrap gap-2">
      <button
        v-for="button in buttons"
        :key="button.id"
        :disabled="isButtonDisabled(button)"
        :class="getButtonClasses(button)"
        @click="handleButtonPress(button)"
      >
        {{ getButtonLabel(button) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import type { ButtonConfig, ButtonGroupResponse } from '@app/api'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger'

interface Props {
  buttons: ButtonConfig[]
  disabled?: boolean
  response?: ButtonGroupResponse
  keepInteractive?: boolean
  displayText?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  keepInteractive: false
})

interface Emits {
  (e: 'submit', value: ButtonGroupResponse): void
}

const emit = defineEmits<Emits>()

// Determine if the block is disabled
const isDisabled = computed(() => {
  if (props.keepInteractive) return false
  return props.disabled
})

// Check if a specific button is disabled
const isButtonDisabled = (button: ButtonConfig): boolean => {
  if (isDisabled.value) return true
  const currentState = button.states[button.state]
  return currentState?.disabled || false
}

// Get button label based on current state
const getButtonLabel = (button: ButtonConfig): string => {
  const currentState = button.states[button.state]
  return currentState?.label || button.label
}

// Get button CSS classes based on variant and state
const getButtonClasses = (button: ButtonConfig) => {
  const currentState = button.states[button.state]
  const variant: ButtonVariant = currentState?.variant || 'secondary'
  const disabled = isButtonDisabled(button)

  const baseClasses = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800'

  const variantClasses: Record<ButtonVariant, string> = {
    primary: disabled
      ? 'bg-primary-600/30 text-primary-400/50 cursor-not-allowed'
      : 'bg-primary-600 hover:bg-primary-500 text-white focus:ring-primary-600',
    secondary: disabled
      ? 'bg-neutral-700/30 text-neutral-500 border border-neutral-700 cursor-not-allowed'
      : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200 border border-neutral-600 focus:ring-neutral-600',
    success: disabled
      ? 'bg-green-600/30 text-green-400/50 cursor-not-allowed'
      : 'bg-green-600 hover:bg-green-500 text-white focus:ring-green-600',
    danger: disabled
      ? 'bg-red-600/30 text-red-400/50 cursor-not-allowed'
      : 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-600'
  }

  return `${baseClasses} ${variantClasses[variant]}`
}

// Handle button press
const handleButtonPress = (button: ButtonConfig) => {
  if (isButtonDisabled(button)) return

  const response: ButtonGroupResponse = {
    buttonId: button.id,
    state: button.state
  }

  emit('submit', response)
}

// Response display text
const responseText = computed(() => {
  if (!props.response) return ''

  const button = props.buttons.find(b => b.id === props.response?.buttonId)
  if (!button) return props.response.buttonId

  const stateConfig = button.states[props.response.state]
  return stateConfig?.label || button.label
})

const responseMessage = computed(() => {
  return props.displayText || 'Button pressed'
})
</script>
