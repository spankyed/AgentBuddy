<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button 
        class="z-[4] px-2 rounded flex items-center justify-center bg-neutral-800 border border-[#262626] text-[#e0e0e0] cursor-pointer transition-all duration-200 hover:bg-neutral-700 hover:border-[#333] hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)]" 
        title="Actions menu"
      >
        <MoreVertical :size="20" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent 
        class="bg-neutral-800 border border-[#262626] rounded-md p-1 min-w-[180px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)]" 
        :side="'bottom'" 
        :side-offset="8"
      >
        <DropdownMenuItem 
          v-if="selectedFlowId" 
          class="flex items-center gap-2 px-3 py-2 rounded text-[#e0e0e0] text-sm cursor-pointer outline-none transition-all duration-200  hover:bg-neutral-700 focus:bg-neutral-700" 
          @select="handleEditLabel"
        >
          <Edit :size="16" class="flex-shrink-0 text-primary-500" />
          Edit Label
        </DropdownMenuItem>
        <DropdownMenuItem 
          class="flex items-center gap-2 px-3 py-2 rounded text-[#e0e0e0] text-sm cursor-pointer outline-none transition-all duration-200  hover:bg-neutral-700 focus:bg-neutral-700" 
          @select="handleAutoLayout"
        >
          <Layout :size="16" class="flex-shrink-0 text-primary-500" />
          Auto Layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { Layout, Edit, MoreVertical } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from 'reka-ui'
import type { Direction } from '@/plugins/flows/canvas/useLayout'

interface Props {
  selectedFlowId?: string | null
}

interface Emits {
  (e: 'layout', direction: Direction): void
  (e: 'edit-label'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleAutoLayout = () => {
  emit('layout', 'LR')
}

const handleEditLabel = () => {
  emit('edit-label')
}
</script> 