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
        <DropdownMenuSeparator
          v-if="selectedFlowId && !isRootFlow"
          class="h-px bg-neutral-700 my-1"
        />
        <DropdownMenuItem
          v-if="selectedFlowId && !isRootFlow"
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-red-400 hover:bg-neutral-700 transition-colors"
          @select="handleRequestDelete"
        >
          <div class="flex items-center gap-2 flex-1">
            <Trash2 :size="16" />
            Delete Flow
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Menu, Edit, Trash2 } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from 'reka-ui'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id } from '@/plugins/flows/state'

interface Props {
  selectedFlowId?: string | null
}

interface Emits {
  (e: 'edit-label'): void
  (e: 'request-delete'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Get flows settings to check if this is root flow
const flowsActor = applicationState.system.get(id)
const settings = useSelector(flowsActor, (state: any) => state.context.settings || {})
const isRootFlow = computed(() => props.selectedFlowId === settings.value?.rootFlowId)

const handleEditLabel = () => {
  emit('edit-label')
}

const handleRequestDelete = () => {
  emit('request-delete')
}
</script> 