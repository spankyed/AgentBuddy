<template>
  <div 
    class="flow-node group"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-offset-2 ring-offset-neutral-900': isActive,
        'cursor-pointer': selectable,
      }
    ]"
  >
    <!-- Glow effect on hover -->
    <div 
      class="absolute inset-0 transition-opacity duration-300 rounded-lg opacity-0 group-hover:opacity-100 blur-xl"
      :class="glowClasses"
    />
    
    <!-- Main content -->
    <div class="relative z-10">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <div 
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50"
          :class="iconClasses"
        />
        <span class="text-xs font-medium tracking-tight text-white/90">{{ data.label }}</span>
      </div>
      
      <!-- Custom content slot -->
      <div v-if="$slots.default" class="mt-2 space-y-1">
        <slot />
      </div>
      
      <!-- Node type badge at bottom -->
      <div class="mt-1.5 flex items-center gap-1.5" v-if="data.nodeType || $slots.badge">
        <span 
          v-if="data.nodeType"
          class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase"
          :class="badgeClasses"
        >
          {{ formatNodeType(data.nodeType) }}
        </span>
        <slot name="badge" />
      </div>
    </div>
    
    <!-- Status indicator (if provided) -->
    <div v-if="showStatusIndicator && data.status" class="absolute -top-1.5 -right-1.5">
      <div class="relative">
        <div 
          class="w-2.5 h-2.5 rounded-full"
          :class="statusClasses"
        />
        <div 
          v-if="data.status === 'active'"
          class="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping"
          :class="statusClasses"
        />
      </div>
    </div>
    
    <!-- Connection handles with better styling -->
    <Handle
      v-if="showTargetHandle"
      type="target"
      :position="Position.Left"
      class="!w-2 !h-2 !bg-neutral-700 !border-2 !border-neutral-600 hover:!bg-neutral-600 transition-colors"
    />
    <Handle
      v-if="showSourceHandle"
      type="source"
      :position="Position.Right"
      class="!w-2 !h-2 !bg-neutral-700 !border-2 !border-neutral-600 hover:!bg-neutral-600 transition-colors"
    />
  </div>
</template>

<script lang="ts">
export default {
  name: 'BaseNode'
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { getNodeCanvasClasses, getNodeIconDotClasses } from '../../config/node-config'
import type { NodeKind } from '@abuddy/api'

interface BaseNodeData {
  label: string
  nodeType?: NodeKind
  status?: 'active' | 'paused' | 'completed' | 'failed'
  [key: string]: any
}

interface Props extends NodeProps<BaseNodeData> {
  isActive?: boolean
  selectable?: boolean
  showTargetHandle?: boolean
  showSourceHandle?: boolean
  showStatusIndicator?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  selectable: true,
  showTargetHandle: true,
  showSourceHandle: true,
  showStatusIndicator: false
})

const nodeClasses = computed(() => {
  const baseClasses = 'px-3 py-2 rounded-md border backdrop-blur-sm transition-all duration-200'
  const type = props.data.nodeType || 'action'
  
  // Enhanced styling with better gradients and shadows
  switch (type) {
    case 'flow':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400`
    case 'listen':
      return `${baseClasses} bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 ring-blue-400`
    case 'fire':
      return `${baseClasses} bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-500/20 ring-amber-400`
    case 'query':
      return `${baseClasses} bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/20 ring-cyan-400`
    case 'create':
    case 'update':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400`
    case 'decision':
      return `${baseClasses} bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/50 hover:shadow-lg hover:shadow-orange-500/20 ring-orange-400`
    case 'transform':
      return `${baseClasses} bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/20 ring-emerald-400`
    case 'llm':
      return `${baseClasses} bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/20 ring-indigo-400`
    default:
      return `${baseClasses} bg-gradient-to-br from-neutral-700/50 to-neutral-800/30 border-neutral-600 hover:border-neutral-500 hover:shadow-lg hover:shadow-neutral-500/20 ring-neutral-400`
  }
})

const iconClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  const base = getNodeIconDotClasses(type)
  // Add ring color matching the node type
  const ringColor = base.replace('bg-', 'ring-')
  return `${base} ${ringColor}/30`
})

const glowClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  switch (type) {
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
})

const badgeClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  switch (type) {
    case 'flow': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    case 'listen': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    case 'fire': return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
    case 'query': return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
    case 'create':
    case 'update': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    case 'decision': return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
    case 'transform': return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
    case 'llm': return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
    default: return 'bg-neutral-700/50 text-neutral-300 border border-neutral-600'
  }
})

const statusClasses = computed(() => {
  if (!props.data.status) return ''
  
  switch (props.data.status) {
    case 'active':
      return 'bg-green-400 shadow-green-400/50 shadow-sm'
    case 'paused':
      return 'bg-yellow-400 shadow-yellow-400/50 shadow-sm'
    case 'completed':
      return 'bg-blue-400 shadow-blue-400/50 shadow-sm'
    case 'failed':
      return 'bg-red-400 shadow-red-400/50 shadow-sm'
    default:
      return 'bg-neutral-400'
  }
})

const formatNodeType = (type: string) => {
  // Format node type for display
  return type.replace(/_/g, ' ')
}
</script>

<style scoped>
.flow-node {
  min-width: 150px;
  max-width: 240px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.flow-node:hover {
  transform: translateY(-0.5px);
}

/* Vue Flow handle overrides for better visibility */
:deep(.vue-flow__handle) {
  transition: all 0.2s ease;
}

/* :deep(.vue-flow__handle:hover) {
  transform: scale(1.2);
} */

/* Smooth transitions for all interactive elements */
.flow-node * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}
</style>