<template>
  <div class="color-picker">
    <div class="flex items-center gap-2">
      <!-- Current color display -->
      <button
        @click="showPicker = !showPicker"
        class="w-10 h-10 rounded-lg border-2 border-neutral-700 hover:border-neutral-600 transition-all relative overflow-hidden"
        :style="{ backgroundColor: modelValue || '#6B7280' }"
        :title="modelValue || 'Select a color'"
      >
        <span v-if="!modelValue" class="absolute inset-0 flex items-center justify-center text-neutral-500">
          <Palette class="w-4 h-4" />
        </span>
      </button>
      
      <!-- Color label/input -->
      <input
        v-model="colorInput"
        @input="handleColorInput"
        @blur="validateColorInput"
        type="text"
        placeholder="#000000"
        class="w-24 px-2 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded text-white placeholder-neutral-600 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
      />
    </div>
    
    <!-- Color picker dropdown -->
    <Transition name="picker">
      <div 
        v-if="showPicker" 
        class="absolute z-50 mt-2 p-3 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl"
      >
        <!-- Preset colors -->
        <div class="grid grid-cols-7 gap-1 mb-2">
          <button
            v-for="color in presetColors"
            :key="color"
            @click="selectColor(color)"
            class="w-8 h-8 rounded hover:scale-110 transition-transform border-2"
            :class="modelValue === color ? 'border-white' : 'border-transparent'"
            :style="{ backgroundColor: color }"
            :title="color"
          />
        </div>
        
        <!-- Custom color input -->
        <div class="pt-2 border-t border-neutral-700">
          <label class="text-xs text-neutral-400 mb-1 block">Custom Color</label>
          <div class="flex gap-2">
            <input
              v-model="customColor"
              type="color"
              class="w-full h-8 bg-neutral-700 border border-neutral-600 rounded cursor-pointer"
              @input="selectColor(customColor)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Palette } from 'lucide-vue-next'

interface Props {
  modelValue?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

// State
const showPicker = ref(false)
const colorInput = ref(props.modelValue || '')
const customColor = ref('#6B7280')

// Preset color palette
const presetColors = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#EAB308', // yellow
  '#84CC16', // lime
  '#22C55E', // green
  '#10B981', // emerald
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#0EA5E9', // sky
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#D946EF', // fuchsia
  '#EC4899', // pink
  '#F43F5E', // rose
  '#6B7280', // gray
  '#475569', // slate
  '#CA8A04', // yellow-700
  '#DC2626', // red-600
]

// Methods
const selectColor = (color: string) => {
  emit('update:modelValue', color)
  emit('change', color)
  colorInput.value = color
  showPicker.value = false
}

const handleColorInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value
  
  // Allow typing without immediate validation
  colorInput.value = value
}

const validateColorInput = () => {
  const value = colorInput.value.trim()
  
  // Validate hex color format
  const isValidHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)
  
  if (isValidHex) {
    selectColor(value.toUpperCase())
  } else {
    // Reset to current value if invalid
    colorInput.value = props.modelValue || ''
  }
}

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  colorInput.value = newValue || ''
})

// Close picker when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.color-picker')) {
    showPicker.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.picker-enter-active,
.picker-leave-active {
  transition: all 0.2s ease;
}

.picker-enter-from,
.picker-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>