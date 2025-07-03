<template>
  <div class="p-3">
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
          :class="getGlowClasses(item.type)"
        />
        
        <!-- Main content -->
        <div class="relative z-10 flex items-center gap-2.5 px-3 py-2">
          <!-- Icon dot with enhanced styling -->
          <div 
            class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
            :class="getIconClasses(item.type)"
          />
          
          <!-- Label -->
          <span class="text-xs font-medium tracking-tight text-white/90 transition-colors duration-200 group-hover:text-white">
            {{ item.label }}
          </span>
          
          <!-- Icon with enhanced styling -->
          <component
            :is="item.icon"
            class="w-3.5 h-3.5 ml-auto transition-all duration-200"
            :class="getIconComponentClasses(item.type)"
          />
        </div>
        
        <!-- Subtle gradient overlay -->
        <div 
          class="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-10 transition-opacity duration-200 pointer-events-none"
          :class="getGradientClasses(item.type)"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getPaletteItems } from '../../config/node-config'
import type { NodeKind } from '@abuddy/api'

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

// Get palette item classes matching our node styles
function getPaletteItemClasses(type: string) {
  const baseClasses = 'rounded-md border backdrop-blur-sm transition-all duration-200 cursor-grab active:cursor-grabbing active:scale-[0.98]'
  
  switch (type as NodeKind) {
    case 'flow':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20`
    case 'listen':
      return `${baseClasses} bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20`
    case 'fire':
      return `${baseClasses} bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-500/20`
    case 'query':
      return `${baseClasses} bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/20`
    case 'create':
    case 'update':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20`
    case 'decision':
      return `${baseClasses} bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/50 hover:shadow-lg hover:shadow-orange-500/20`
    case 'transform':
      return `${baseClasses} bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/20`
    case 'llm':
      return `${baseClasses} bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/20`
    default:
      return `${baseClasses} bg-gradient-to-br from-neutral-700/50 to-neutral-800/30 border-neutral-600 hover:border-neutral-500 hover:shadow-lg hover:shadow-neutral-500/20`
  }
}

// Get icon dot classes
function getIconClasses(type: string) {
  switch (type as NodeKind) {
    case 'flow': return 'bg-purple-500 ring-purple-500/30 group-hover:ring-purple-400/50'
    case 'listen': return 'bg-blue-500 ring-blue-500/30 group-hover:ring-blue-400/50'
    case 'fire': return 'bg-amber-500 ring-amber-500/30 group-hover:ring-amber-400/50'
    case 'query': return 'bg-cyan-500 ring-cyan-500/30 group-hover:ring-cyan-400/50'
    case 'create':
    case 'update': return 'bg-purple-500 ring-purple-500/30 group-hover:ring-purple-400/50'
    case 'decision': return 'bg-orange-500 ring-orange-500/30 group-hover:ring-orange-400/50'
    case 'transform': return 'bg-emerald-500 ring-emerald-500/30 group-hover:ring-emerald-400/50'
    case 'llm': return 'bg-indigo-500 ring-indigo-500/30 group-hover:ring-indigo-400/50'
    default: return 'bg-neutral-500 ring-neutral-500/30 group-hover:ring-neutral-400/50'
  }
}

// Get icon component classes
function getIconComponentClasses(type: string) {
  switch (type as NodeKind) {
    case 'flow': return 'text-purple-400 group-hover:text-purple-300'
    case 'listen': return 'text-blue-400 group-hover:text-blue-300'
    case 'fire': return 'text-amber-400 group-hover:text-amber-300'
    case 'query': return 'text-cyan-400 group-hover:text-cyan-300'
    case 'create':
    case 'update': return 'text-purple-400 group-hover:text-purple-300'
    case 'decision': return 'text-orange-400 group-hover:text-orange-300'
    case 'transform': return 'text-emerald-400 group-hover:text-emerald-300'
    case 'llm': return 'text-indigo-400 group-hover:text-indigo-300'
    default: return 'text-neutral-400 group-hover:text-neutral-300'
  }
}

// Get glow classes
function getGlowClasses(type: string) {
  switch (type as NodeKind) {
    case 'flow': return 'bg-purple-500/20'
    case 'listen': return 'bg-blue-500/20'
    case 'fire': return 'bg-amber-500/20'
    case 'query': return 'bg-cyan-500/20'
    case 'create':
    case 'update': return 'bg-purple-500/20'
    case 'decision': return 'bg-orange-500/20'
    case 'transform': return 'bg-emerald-500/20'
    case 'llm': return 'bg-indigo-500/20'
    default: return 'bg-neutral-500/20'
  }
}

// Get gradient overlay classes
function getGradientClasses(type: string) {
  switch (type as NodeKind) {
    case 'flow': return 'from-purple-400 to-purple-600'
    case 'listen': return 'from-blue-400 to-blue-600'
    case 'fire': return 'from-amber-400 to-amber-600'
    case 'query': return 'from-cyan-400 to-cyan-600'
    case 'create':
    case 'update': return 'from-purple-400 to-purple-600'
    case 'decision': return 'from-orange-400 to-orange-600'
    case 'transform': return 'from-emerald-400 to-emerald-600'
    case 'llm': return 'from-indigo-400 to-indigo-600'
    default: return 'from-neutral-400 to-neutral-600'
  }
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