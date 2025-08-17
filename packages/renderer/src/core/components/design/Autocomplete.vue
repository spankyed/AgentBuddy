<template>
  <div ref="containerRef" class="relative">
    <input
      ref="inputRef"
      :value="modelValue"
      @input="handleInput"
      @keydown="handleKeydown"
      @focus="handleFocus"
      @blur="handleBlur"
      :type="type"
      :placeholder="placeholder"
      :class="inputClass"
    />
    <teleport to="body">
      <Transition name="dropdown">
        <div
          v-if="showDropdown && filteredSuggestions.length > 0"
          ref="dropdownRef"
          :style="dropdownStyle"
          class="fixed z-50 overflow-hidden bg-neutral-900 border border-neutral-700 rounded-md shadow-lg"
        >
          <ul class="max-h-48 overflow-y-auto">
            <li
              v-for="(suggestion, index) in filteredSuggestions"
              :key="suggestion"
              @mousedown.prevent="selectSuggestion(suggestion)"
              :class="[
                'px-3 py-2 text-sm cursor-pointer transition-colors',
                selectedIndex === index
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-300 hover:bg-neutral-800'
              ]"
            >
              {{ suggestion }}
            </li>
          </ul>
        </div>
      </Transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps<{
  modelValue: string
  suggestions: string[]
  placeholder?: string
  type?: string
  inputClass?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'enter': []
}>()

const inputRef = ref<HTMLInputElement>()
const containerRef = ref<HTMLDivElement>()
const dropdownRef = ref<HTMLDivElement>()
const showDropdown = ref(false)
const selectedIndex = ref(-1)
const dropdownStyle = ref<{ top: string; left: string; width: string }>({
  top: '0px',
  left: '0px',
  width: '0px'
})

const filteredSuggestions = computed(() => {
  const value = props.modelValue.toLowerCase()
  if (!value) return []
  
  return props.suggestions
    .filter(s => s.toLowerCase().startsWith(value))
    .slice(0, 5)
})

watch(filteredSuggestions, () => {
  selectedIndex.value = -1
})

const handleInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
  showDropdown.value = true
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!showDropdown.value || filteredSuggestions.value.length === 0) {
    if (event.key === 'Enter') {
      event.preventDefault()
      emit('enter')
    }
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = Math.min(
        selectedIndex.value + 1,
        filteredSuggestions.value.length - 1
      )
      break
    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
      break
    case 'Enter':
      event.preventDefault()
      if (selectedIndex.value >= 0) {
        selectSuggestion(filteredSuggestions.value[selectedIndex.value])
      } else {
        showDropdown.value = false
        emit('enter')
      }
      break
    case 'Escape':
      showDropdown.value = false
      selectedIndex.value = -1
      break
    case 'Tab':
      if (selectedIndex.value >= 0) {
        event.preventDefault()
        selectSuggestion(filteredSuggestions.value[selectedIndex.value])
      } else if (filteredSuggestions.value.length > 0) {
        event.preventDefault()
        selectSuggestion(filteredSuggestions.value[0])
      }
      break
  }
}

const selectSuggestion = (suggestion: string) => {
  emit('update:modelValue', suggestion)
  showDropdown.value = false
  selectedIndex.value = -1
  inputRef.value?.focus()
}

const updateDropdownPosition = () => {
  if (!inputRef.value || !showDropdown.value) return
  
  const rect = inputRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`
  }
}

const handleFocus = async () => {
  showDropdown.value = true
  await nextTick()
  updateDropdownPosition()
}

const handleBlur = () => {
  setTimeout(() => {
    showDropdown.value = false
    selectedIndex.value = -1
  }, 200)
}

watch(showDropdown, (isVisible) => {
  if (isVisible) {
    updateDropdownPosition()
  }
})

onMounted(() => {
  window.addEventListener('scroll', updateDropdownPosition, true)
  window.addEventListener('resize', updateDropdownPosition)
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateDropdownPosition, true)
  window.removeEventListener('resize', updateDropdownPosition)
})
</script>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>