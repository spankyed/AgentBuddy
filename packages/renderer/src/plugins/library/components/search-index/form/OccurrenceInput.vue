<template>
  <div class="relative">
    <input
      v-model="localValue"
      type="text"
      placeholder="all"
      class="w-24 px-2 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-sm text-neutral-100 outline-none focus:border-neutral-600 placeholder-neutral-500"
      :class="[
        !isValid && 'border-red-400 focus:border-red-500'
      ]"
      @input="handleInput"
      @blur="validateAndFormat"
      @focus="showTooltip = true"
    />
    
    <!-- Tooltip -->
    <div 
      v-if="showTooltip"
      @mouseenter="keepTooltipOpen = true"
      @mouseleave="keepTooltipOpen = false"
      class="absolute top-full left-0 mt-1 p-2 bg-neutral-900 border border-neutral-700 rounded-md shadow-xl z-10 whitespace-nowrap"
    >
      <p class="text-xs text-neutral-400 mb-1">Examples:</p>
      <ul class="text-xs text-neutral-500 space-y-0.5">
        <li><code class="text-primary-500 font-mono">first</code> - First occurrence</li>
        <li><code class="text-primary-500 font-mono">last</code> - Last occurrence</li>
        <li><code class="text-primary-500 font-mono">all</code> - All occurrences</li>
        <li><code class="text-primary-500 font-mono">3</code> - Third occurrence</li>
        <li><code class="text-primary-500 font-mono">2-5</code> - 2nd to 5th</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

type Occurrence =
  | 'first'
  | 'last'
  | 'all'
  | { index: number }
  | { from: number; to: number }

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const localValue = ref(props.modelValue)
const isValid = ref(true)
const showTooltip = ref(false)
const keepTooltipOpen = ref(false)

watch(() => props.modelValue, (newValue) => {
  localValue.value = newValue
})

function handleInput() {
  emit('update:modelValue', localValue.value)
  validateOccurrence()
}

function validateOccurrence(): boolean {
  const value = localValue.value.trim()
  
  // Valid patterns: "first", "last", "all", number, or range (N-X)
  const validPatterns = [
    /^(first|last|all)$/i,
    /^\d+$/,
    /^\d+-\d+$/
  ]
  
  isValid.value = validPatterns.some(pattern => pattern.test(value))
  return isValid.value
}

function parseOccurrence(value: string): Occurrence | null {
  const trimmed = value.trim().toLowerCase()
  
  // Check for keywords
  if (trimmed === 'first' || trimmed === 'last' || trimmed === 'all') {
    return trimmed as 'first' | 'last' | 'all'
  }
  
  // Check for single number (N)
  const singleNumber = /^(\d+)$/.exec(trimmed)
  if (singleNumber) {
    return { index: parseInt(singleNumber[1]) }
  }
  
  // Check for range (N-X)
  const range = /^(\d+)-(\d+)$/.exec(trimmed)
  if (range) {
    return { 
      from: parseInt(range[1]), 
      to: parseInt(range[2]) 
    }
  }
  
  return null
}

function validateAndFormat() {
  setTimeout(() => {
    if (!keepTooltipOpen.value) {
      showTooltip.value = false
    }
  }, 200)
  
  if (!localValue.value.trim()) {
    localValue.value = 'all'
    emit('update:modelValue', localValue.value)
  }
  validateOccurrence()
}

// Export the parser for use in other components
export { parseOccurrence }
export type { Occurrence }
</script>