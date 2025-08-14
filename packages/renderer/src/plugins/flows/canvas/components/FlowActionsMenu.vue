<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button 
        class="flex items-center justify-center px-3 py-1.5 text-sm rounded-md bg-neutral-900/90 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 transition-all backdrop-blur-sm"
        title="Menu options"
      >
        <Menu :size="16" class="mr-1.5" />
        <span>Menu</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent 
        class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[180px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)]" 
        :side="'bottom'" 
        :side-offset="8"
      >
        <DropdownMenuItem 
          v-if="selectedFlowId" 
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors" 
          @select="handleEditLabel"
        >
          <div class="flex items-center gap-2 flex-1">
            <Edit :size="16" class="text-primary-400" />
            Edit Label
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { Menu, Edit } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from 'reka-ui'
interface Props {
  selectedFlowId?: string | null
}

interface Emits {
  (e: 'edit-label'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleEditLabel = () => {
  emit('edit-label')
}
</script> 