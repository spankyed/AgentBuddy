<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <button
        class="w-full px-2 py-1.5 text-left cursor-pointer select-none transition-all duration-200 rounded-md hover:bg-neutral-800"
        :class="[
          isSelected ? 'bg-neutral-800/50' : '',
          isMultiSelected ? 'ring-1 ring-blue-500/40 bg-blue-500/10' : ''
        ]"
        :data-onboarding-id="isRoot ? 'flow-root-item' : undefined"
        @click="$emit('click', $event)"
        @dblclick="$emit('dblclick')"
      >
        <div class="flex items-center gap-2">
          <!-- Flow info -->
          <div class="flex-1 min-w-0">
            <span class="text-xs font-medium tracking-tight truncate text-neutral-100">
              {{ flow.label || (isRoot ? 'Main Flow' : `Flow ${flow.id}`) }}
            </span>
            <div v-if="flow.description" class="text-[10px] text-neutral-500 truncate mt-0.5">
              {{ flow.description }}
            </div>
          </div>

          <!-- Root badge -->
          <span
            v-if="isRoot"
            class="inline-flex items-center flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
          >
            root
          </span>

          <!-- Icon -->
          <component
            :is="isRoot ? Brain : Workflow"
            class="w-3.5 h-3.5 flex-shrink-0 text-neutral-500"
          />
        </div>
      </button>
    </ContextMenuTrigger>

    <!-- Context Menu - Only show for non-root flows -->
    <ContextMenuPortal v-if="!isRoot">
      <ContextMenuContent
        class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[160px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)] z-50"
        :side-offset="2"
      >
        <ContextMenuItem
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
          @select="handleRequestEditLabel"
        >
          <Edit :size="14" class="text-primary-400" />
          Edit Label
        </ContextMenuItem>
        <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />
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
import { Brain, Workflow, Trash2, Edit } from 'lucide-vue-next'
import type { FlowEntity } from '@app/api'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from 'reka-ui'

interface Props {
  flow: Partial<FlowEntity>
  isSelected?: boolean
  isMultiSelected?: boolean
  isRoot?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: [event: MouseEvent]
  dblclick: []
  'request-delete': [flow: Partial<FlowEntity>]
  'request-edit-label': [flow: Partial<FlowEntity>]
}>()

const handleRequestDelete = () => {
  emit('request-delete', props.flow)
}

const handleRequestEditLabel = () => {
  emit('request-edit-label', props.flow)
}
</script>
