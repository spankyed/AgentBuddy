<template>
  <div class="p-3" data-onboarding-id="flow-node-palette">
    <div class="mt-3 space-y-1.5">
      <button
        v-for="item in paletteItems"
        :key="item.type"
        class="palette-item w-full group relative overflow-hidden"
        :class="getPaletteItemClasses(item.type)"
        draggable="true"
        @dragstart="(e) => handleDragStart(e, item.type)"
        @click="$emit('palette-click', item.type)"
      >
        <!-- Glow effect on hover -->
        <div 
          class="absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 blur-xl"
          :class="getPaletteGlowClasses(item.type)"
        />
        
        <!-- Main content -->
        <div class="relative z-10 flex items-center gap-2.5 px-3 py-2">
          <!-- Icon dot with enhanced styling -->
          <div 
            class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
            :class="getPaletteIconClasses(item.type)"
          />
          
          <!-- Label -->
          <span class="text-xs font-medium tracking-tight text-white/90 transition-colors duration-200 group-hover:text-white">
            {{ item.label }}
          </span>
          
          <!-- Icon with enhanced styling -->
          <component
            :is="item.icon"
            class="w-3.5 h-3.5 ml-auto transition-all duration-200"
            :class="getPaletteIconComponentClasses(item.type)"
          />
        </div>
        
        <!-- Subtle gradient overlay -->
        <div 
          class="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-10 transition-opacity duration-200 pointer-events-none"
          :class="getPaletteGradientClasses(item.type)"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { 
  getPaletteItems,
  getPaletteItemClasses,
  getPaletteIconClasses,
  getPaletteIconComponentClasses,
  getPaletteGlowClasses,
  getPaletteGradientClasses
} from '../../config/node-config'

interface PaletteItem {
  type: string
  label: string
  icon: any
}

const props = withDefaults(defineProps<{
  paletteItems?: PaletteItem[]
}>(), {
  paletteItems: () => getPaletteItems()
})

const emit = defineEmits<{
  'palette-click': [nodeType: string]
  'drag-start': [e: DragEvent, nodeType: string]
}>()

function handleDragStart(e: DragEvent, nodeType: string) {
  e.dataTransfer?.setData('application/vueflow', nodeType)
  e.dataTransfer!.effectAllowed = 'move'
  emit('drag-start', e, nodeType)
}
</script>

<style scoped>
.palette-item {
  transform-origin: center;
  position: relative;
}

.palette-item:hover {
  transform: translateY(-0.5px);
}

/* Enhanced visual feedback on drag */
.palette-item:active {
  transform: scale(0.98);
}

/* Smooth transitions for all interactive elements */
.palette-item * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}
</style>