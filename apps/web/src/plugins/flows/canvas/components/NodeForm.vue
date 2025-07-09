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
        <div 
          @click="$emit('close')"
          class="absolute flex items-center gap-2 px-3 py-2 transition-colors border border-r-0 rounded-l-lg cursor-pointer right-full top-10 bg-neutral-900 border-neutral-800 hover:bg-neutral-800"
        >
          <X class="w-4 h-4 text-neutral-400" />
          <span class="text-sm font-semibold text-neutral-100">{{ selectedNode.nodeType.toUpperCase() }}</span>
        </div>
        
        <!-- Next step dropdown -->
        <DropdownMenuRoot
          :open="showNextStepMenu"
          @update:open="showNextStepMenu = $event"
        >
          <DropdownMenuTrigger as-child>
            <div 
              class="absolute flex items-center gap-2 px-3 py-2 transition-all bg-blue-600 border border-r-0 border-blue-500 rounded-l-lg cursor-pointer next-step-trigger right-full bottom-10 hover:bg-blue-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/20"
            >
              <Plus class="w-4 h-4 text-white" />
              <span class="text-sm font-semibold text-white whitespace-nowrap">Next step</span>
            </div>
          </DropdownMenuTrigger>
          
          <DropdownMenuPortal>
            <DropdownMenuContent 
              side="bottom"
              align="start"
              :side-offset="8"
              class="z-50 overflow-hidden border rounded-lg shadow-2xl w-52 bg-neutral-900 border-neutral-700"
            >
              <div class="p-1.5 max-h-96 overflow-y-auto">
                <DropdownMenuItem
                  v-for="item in paletteItems"
                  :key="item.type"
                  @select="handleCreateConnectedNode(item.type)"
                  class="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 rounded-md cursor-pointer transition-colors hover:bg-neutral-800 hover:text-white outline-none focus:bg-neutral-800 focus:text-white"
                >
                  <component :is="item.icon" class="flex-shrink-0 w-4 h-4" />
                  <span class="font-medium">{{ item.label }}</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
      
      <!-- Form content -->
      <div class="flex-1 overflow-x-hidden overflow-y-auto bg-neutral-800">
        <component
          :is="getFormComponent(selectedNode.nodeType)"
          :key="selectedNode.id"
          :node="selectedNode"
          :resources="{ actions, models, prompts }"
          @update-node="handleUpdateNode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { NodeEntity, ActionEntity, ModelConfig, PromptEntity } from '@abuddy/api'
import { X, Plus } from 'lucide-vue-next'
import { getPaletteItems } from '../../config/node-config'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'

// Form components
import BaseForm from '../forms/BaseForm.vue'
import ListenForm from '../forms/ListenForm.vue'
import FireForm from '../forms/FireForm.vue'
import CreateForm from '../forms/CreateForm.vue'
import LLMForm from '../forms/LLMForm.vue'
import ActionForm from '../forms/ActionForm.vue'

interface Props {
  selectedNode?: NodeEntity | null
  actions?: ActionEntity[]
  models?: ModelConfig[]
  prompts?: PromptEntity[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close': []
  'update-node': [nodeId: string, updates: Record<string, any>]
  'create-connected': [nodeType: string, sourceNodeId: string]
}>()

function handleUpdateNode(updates: Record<string, any>) {
  if (props.selectedNode?.id) {
    emit('update-node', props.selectedNode.id, updates)
  }
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

// Next step functionality
const showNextStepMenu = ref(false)
const paletteItems = getPaletteItems()

// Watch for selected node changes and reset menu state
watch(() => props.selectedNode?.id, () => {
  showNextStepMenu.value = false
})

function handleCreateConnectedNode(nodeType: string) {
  if (!props.selectedNode?.id) return
  
  // Emit event to parent
  emit('create-connected', nodeType, props.selectedNode.id)
  
  // Close the menu
  showNextStepMenu.value = false
}

// Reka UI DropdownMenu handles click outside and positioning automatically
</script>

<style>

</style> 