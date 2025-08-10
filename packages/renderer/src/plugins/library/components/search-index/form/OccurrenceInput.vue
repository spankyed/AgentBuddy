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
      @blur="handleBlur"
      @focus="handleFocus"
    />
    
    <!-- Dropdown with hints -->
    <div 
      v-if="showDropdown"
      @mouseenter="keepDropdownOpen = true"
      @mouseleave="keepDropdownOpen = false"
      class="absolute top-full left-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-md shadow-xl z-10 whitespace-nowrap overflow-hidden"
    >
      <!-- Quick Select Options -->
      <div class="border-b border-neutral-800">
        <button
          v-for="option in quickOptions"
          :key="option.value"
          type="button"
          @click="selectOption(option.value)"
          class="w-full px-3 py-1.5 text-xs text-left hover:bg-neutral-800 transition-colors flex items-center justify-between group"
        >
          <span class="text-neutral-300 group-hover:text-neutral-100">{{ option.label }}</span>
          <code class="text-primary-500 font-mono ml-3">{{ option.value }}</code>
        </button>
      </div>
      
      <!-- Examples -->
      <div class="p-2">
        <p class="text-xs text-neutral-500 mb-1">Other examples:</p>
        <ul class="text-xs text-neutral-600 space-y-0.5">
          <li><code class="text-neutral-500 font-mono">3</code> - Third occurrence</li>
          <li><code class="text-neutral-500 font-mono">2-5</code> - 2nd to 5th</li>
        </ul>
      </div>
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
const showDropdown = ref(false)
const keepDropdownOpen = ref(false)

const quickOptions = [
  { value: 'first', label: 'First occurrence' },
  { value: 'last', label: 'Last occurrence' },
  { value: 'all', label: 'All occurrences' },
]

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

function handleFocus() {
  showDropdown.value = true
}

function handleBlur() {
  setTimeout(() => {
    if (!keepDropdownOpen.value) {
      showDropdown.value = false
    }
  }, 200)
  
  if (!localValue.value.trim()) {
    localValue.value = 'all'
    emit('update:modelValue', localValue.value)
  }
  validateOccurrence()
}

function selectOption(value: string) {
  localValue.value = value
  emit('update:modelValue', value)
  showDropdown.value = false
  keepDropdownOpen.value = false
  validateOccurrence()
}

// Export the parser for use in other components
// export { parseOccurrence }
// export type { Occurrence }
</script>