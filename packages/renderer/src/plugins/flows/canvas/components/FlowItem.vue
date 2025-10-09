<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        class="flow-item"
        :class="{ 'has-description': flow.description }"
      >
        <button
          class="relative w-full overflow-hidden flow-button group"
          :class="[isSelected ? 'selected' : '', isRoot ? 'root-flow' : 'sub-flow']"
          :data-onboarding-id="isRoot ? 'flow-root-item' : undefined"
          @click="$emit('click')"
    >
      <!-- Glow effect on hover -->
      <div 
        class="absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 blur-xl"
        :class="isRoot ? 'bg-purple-500/20' : 'bg-blue-500/20'"
      />
      
      <!-- Main content -->
      <div class="relative z-10 flex items-center gap-2 px-3 py-2.5">
        <!-- Icon -->
        <div 
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
          :class="isRoot ? 'bg-purple-400 ring-purple-400/30' : 'bg-blue-400 ring-blue-400/30'"
        />
        
        <!-- Flow info -->
        <div class="flex-1 min-w-0 text-left">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium tracking-tight truncate transition-colors duration-200 text-white/90 group-hover:text-white">
              {{ flow.label || (isRoot ? 'Main Flow' : `Flow ${flow.id}`) }}
            </span>
          </div>
          <div v-if="flow.description" class="text-[10px] text-neutral-500 truncate mt-0.5">
            {{ flow.description }}
          </div>
        </div>
        
        <!-- Icon -->
        <component
          :is="isRoot ? Brain : Workflow"
          class="w-3.5 h-3.5 flex-shrink-0 transition-all duration-200"
          :class="isRoot ? 'text-purple-400' : 'text-blue-400'"
        />
      </div>
      
        <!-- Subtle gradient overlay -->
        <div
          class="absolute inset-0 transition-opacity duration-200 opacity-0 pointer-events-none bg-gradient-to-r group-hover:opacity-10"
          :class="isRoot ? 'from-purple-500/20 to-transparent' : 'from-blue-500/20 to-transparent'"
        />
      </button>
      </div>
    </ContextMenuTrigger>

    <!-- Context Menu - Only show for non-root flows -->
    <ContextMenuPortal v-if="!isRoot">
      <ContextMenuContent
        class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[160px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)] z-50"
        :side-offset="2"
      >
        <ContextMenuItem
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-red-400 hover:bg-neutral-700 transition-colors outline-none"
          @select="handleRequestDelete"
        >
          <Trash2 :size="14" />
          Delete Flow
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { Brain, Workflow, Trash2 } from 'lucide-vue-next'
import type { FlowEntity } from '@app/api'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
} from 'reka-ui'

interface Props {
  flow: Partial<FlowEntity>
  isSelected?: boolean
  isRoot?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
  'request-delete': [flow: Partial<FlowEntity>]
}>()

const handleRequestDelete = () => {
  emit('request-delete', props.flow)
}
</script>

<style scoped>
.flow-item {
  user-select: none;
  margin-bottom: 0.25rem;
  width: 100%;
}

.flow-button {
  border-radius: 0.375rem;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.2s ease;
  transform-origin: center;
  position: relative;
  text-align: left;
  width: 100%;
  cursor: pointer;
  padding: 0;
}

.flow-button:hover {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  transform: translateX(1px);
}

.flow-button:active {
  transform: scale(0.995);
}

/* Selected state */
.flow-button.selected {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.flow-button.selected:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

/* Root flow specific styles */
.flow-button.root-flow.selected {
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.2);
}

.flow-button.root-flow.selected:hover {
  background: rgba(168, 85, 247, 0.1);
  border-color: rgba(168, 85, 247, 0.25);
}

/* Sub flow specific styles */
.flow-button.sub-flow.selected {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.2);
}

.flow-button.sub-flow.selected:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
}

/* Smooth transitions for all interactive elements */
.flow-button * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}
</style>