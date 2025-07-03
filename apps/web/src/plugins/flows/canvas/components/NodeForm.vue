<template>
  <div v-if="selectedNode">
    <!-- Backdrop overlay -->
    <div 
      class="absolute top-0 left-0 w-full h-full bg-black/70 z-[5]" 
      @click="$emit('close')" 
    />
    
    <!-- Slide-in form with tab -->
    <div 
      class="absolute top-0 right-0 w-2/5 h-full transform transition-transform duration-300 ease-in-out z-[6] flex"
      :class="selectedNode ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Tab hanging off the side -->
      <div class="relative">
        <div class="absolute flex items-center gap-2 px-3 py-2 border border-r-0 rounded-l-lg right-full top-10 bg-neutral-900 border-neutral-800">
          <button
            @click="$emit('close')"
            class="p-1 mr-auto transition-colors rounded hover:bg-neutral-700"
          >
            <X class="w-4 h-4 text-neutral-400 hover:text-neutral-200" />
          </button>
          <span class="text-sm font-semibold text-neutral-100">{{ selectedNode.nodeType.toUpperCase() }}</span>
        </div>
      </div>
      
      <!-- Form content -->
      <div class="flex-1 overflow-x-hidden overflow-y-auto bg-neutral-800">
        <component
          :is="getFormComponent(selectedNode.nodeType)"
          :node="selectedNode"
          @update-label="handleUpdateLabel"
          @update-config="handleUpdateConfig"
          @update-node="handleUpdateNode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NodeEntity } from '@abuddy/api'
import { X } from 'lucide-vue-next'

// Form components
import BaseForm from '../forms/BaseForm.vue'
import ListenForm from '../forms/ListenForm.vue'
import FireForm from '../forms/FireForm.vue'
import CreateForm from '../forms/CreateForm.vue'
import LLMForm from '../forms/LLMForm.vue'
import ActionForm from '../forms/ActionForm.vue'

interface Props {
  selectedNode?: NodeEntity | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close': []
  'update-label': [nodeId: string, label: string]
  'update-config': [nodeId: string, config: Record<string, any>]
  'update-node': [node: Partial<NodeEntity>]
}>()

function handleUpdateLabel(label: string) {
  if (props.selectedNode?.id) {
    emit('update-label', props.selectedNode.id, label)
  }
}

function handleUpdateConfig(config: Record<string, any>) {
  if (props.selectedNode?.id) {
    emit('update-config', props.selectedNode.id, config)
  }
}

function handleUpdateNode(node: Partial<NodeEntity>) {
  emit('update-node', node)
}

function getFormComponent(nodeType: string) {
  const formMap: Record<string, any> = {
    'listen': ListenForm,
    'fire': FireForm,
    'create': CreateForm,
    'llm': LLMForm,
    'action': ActionForm,
  }
  return formMap[nodeType] || BaseForm
}
</script>

<style>

</style> 