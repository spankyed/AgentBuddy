<template>
  <div class="flex items-center gap-3" :class="containerClass">
    <div 
      class="relative flex-1 flex items-center justify-between px-3 py-2 bg-neutral-800 border rounded-lg text-sm cursor-pointer transition-all"
      :class="[
        isRecording 
          ? 'border-blue-500/50 ring-2 ring-blue-500/20' 
          : 'border-neutral-700/50 hover:border-neutral-600',
        inputClass
      ]"
      @click="startRecording"
      tabindex="0"
      @focus="startRecording"
      @blur="stopRecording"
      @keydown.prevent="recordKeyPress"
    >
      <!-- Label on the left -->
      <span v-if="label" class="text-neutral-400 text-xs uppercase tracking-wider">
        {{ label }}
      </span>
      
      <!-- Hotkey value on the right -->
      <span 
        class="font-mono ml-auto"
        :class="[
          isRecording ? 'text-blue-400' : isEmpty ? 'text-neutral-500' : 'text-white'
        ]"
      >
        {{ displayValue }}
      </span>
      
      <!-- Keyboard icon -->
      <Keyboard 
        v-if="!isRecording && showIcon && isEmpty" 
        class="ml-2 w-4 h-4 text-neutral-500" 
      />
    </div>
    <button
      v-if="modelValue && showResetButton && !isEmpty"
      @click="resetShortcut"
      class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
      :title="resetButtonTitle"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Keyboard, X } from 'lucide-vue-next'
import { applicationState } from '@/main'

export interface KeyboardShortcut {
  modifiers: string[]
  key: string
}

interface Props {
  modelValue?: KeyboardShortcut | null
  id?: string
  label?: string
  placeholder?: string
  recordingPlaceholder?: string
  emptyText?: string
  showIcon?: boolean
  showResetButton?: boolean
  resetButtonTitle?: string
  containerClass?: string
  inputClass?: string
  multiArrowSupport?: boolean
  multiArrowTimeout?: number
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Click to set shortcut',
  recordingPlaceholder: 'Press shortcut keys...',
  emptyText: 'Not set',
  showIcon: true,
  showResetButton: true,
  resetButtonTitle: 'Reset shortcut',
  containerClass: '',
  inputClass: '',
  multiArrowSupport: true,
  multiArrowTimeout: 500
})

const emit = defineEmits<{
  'update:modelValue': [value: KeyboardShortcut | null]
  'change': [value: KeyboardShortcut | null]
  'recording-start': []
  'recording-end': []
}>()

const isRecording = ref(false)
const pressedKeys = ref<Set<string>>(new Set())
let recordingTimeout: NodeJS.Timeout | null = null

// Check if shortcut is empty
const isEmpty = computed(() => {
  return !props.modelValue || !props.modelValue.key
})

// Format shortcut for display
const displayValue = computed(() => {
  if (isRecording.value) return props.recordingPlaceholder
  if (isEmpty.value) return props.emptyText
  
  const shortcut = props.modelValue!
  const parts = []
  
  // Add modifiers in consistent order
  if (shortcut.modifiers.includes('cmd')) parts.push('⌘')
  if (shortcut.modifiers.includes('ctrl')) parts.push('⌃')
  if (shortcut.modifiers.includes('option') || shortcut.modifiers.includes('alt')) parts.push('⌥')
  if (shortcut.modifiers.includes('shift')) parts.push('⇧')
  
  // Format the key
  const keyDisplay = formatKey(shortcut.key)
  if (keyDisplay) parts.push(keyDisplay)
  
  return parts.length > 0 ? parts.join(' ') : props.emptyText
})

// Format key for display
const formatKey = (key: string): string => {
  const keyMap: Record<string, string> = {
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'Enter': '⏎',
    'Tab': '⇥',
    ' ': 'Space',
    'Escape': 'Esc',
    'Backspace': '⌫',
    'Delete': '⌦',
    'PageUp': 'PgUp',
    'PageDown': 'PgDn',
    'Home': 'Home',
    'End': 'End',
  }
  
  // Handle combined arrow keys (e.g., "ArrowUp+ArrowDown")
  if (key.includes('+')) {
    const keys = key.split('+')
    const formattedKeys = keys.map(k => keyMap[k] || k.toUpperCase())
    return formattedKeys.join(' ')
  }
  
  return keyMap[key] || key.toUpperCase()
}

// Start recording when input is focused
const startRecording = () => {
  isRecording.value = true
  pressedKeys.value.clear()
  // Notify application state to disable global hotkeys
  applicationState.send({ type: 'HOTKEYS_RECORDING_START' })
  emit('recording-start')
}

// Stop recording when input loses focus
const stopRecording = () => {
  setTimeout(() => {
    isRecording.value = false
    pressedKeys.value.clear()
    if (recordingTimeout) {
      clearTimeout(recordingTimeout)
      recordingTimeout = null
    }
    // Re-enable global hotkeys
    applicationState.send({ type: 'HOTKEYS_RECORDING_END' })
    emit('recording-end')
  }, 100)
}

// Record key press
const recordKeyPress = (event: KeyboardEvent) => {
  if (!isRecording.value) return
  
  // Collect modifiers
  const modifiers: string[] = []
  if (event.metaKey) modifiers.push('cmd')
  if (event.ctrlKey && !event.metaKey) modifiers.push('ctrl')
  if (event.altKey) modifiers.push('option')
  if (event.shiftKey) modifiers.push('shift')
  
  // Don't record modifier keys alone
  const isModifierKey = ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)
  if (isModifierKey) return
  
  // Handle arrow keys with multi-key support
  const isArrowKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
  
  if (isArrowKey && props.multiArrowSupport) {
    // Add to pressed keys set
    pressedKeys.value.add(event.key)
    
    // Clear existing timeout
    if (recordingTimeout) clearTimeout(recordingTimeout)
    
    // Wait for more arrow keys
    recordingTimeout = setTimeout(() => {
      // Combine all arrow keys
      const arrowKeys = Array.from(pressedKeys.value).sort()
      const combinedKey = arrowKeys.length > 1 ? arrowKeys.join('+') : arrowKeys[0]
      
      // Emit the shortcut
      const shortcut: KeyboardShortcut = {
        modifiers,
        key: combinedKey
      }
      emit('update:modelValue', shortcut)
      emit('change', shortcut)
      
      // Stop recording
      pressedKeys.value.clear()
      isRecording.value = false
      
      // Re-enable global hotkeys since we're done
      applicationState.send({ type: 'HOTKEYS_RECORDING_END' })
      emit('recording-end')
      
      ;(event.target as HTMLElement).blur()
    }, props.multiArrowTimeout)
  } else {
    // For non-arrow keys or when multi-arrow is disabled, save immediately
    const shortcut: KeyboardShortcut = {
      modifiers,
      key: event.key
    }
    emit('update:modelValue', shortcut)
    emit('change', shortcut)
    
    // Stop recording
    pressedKeys.value.clear()
    isRecording.value = false
    ;(event.target as HTMLElement).blur()
  }
}

// Reset shortcut
const resetShortcut = () => {
  emit('update:modelValue', null)
  emit('change', null)
}
</script>