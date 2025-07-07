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
        
        <!-- Next step tab at bottom -->
        <div 
          @click="showNextStepMenu = !showNextStepMenu"
          class="absolute flex items-center gap-2 px-3 py-2 transition-all border border-r-0 rounded-l-lg cursor-pointer next-step-trigger right-full bottom-10 bg-blue-600 border-blue-500 hover:bg-blue-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/20"
        >
          <Plus class="w-4 h-4 text-white" />
          <span class="text-sm font-semibold text-white whitespace-nowrap">Next step</span>
        </div>
        
        <!-- Next step dropdown menu -->
        <div 
          v-if="showNextStepMenu"
          class="absolute z-10 mb-10 border rounded-lg shadow-xl next-step-dropdown right-full bottom-10 bg-neutral-900 border-neutral-800"
        >
          <div class="p-2 space-y-1">
            <button
              v-for="item in paletteItems"
              :key="item.type"
              @click="handleCreateConnectedNode(item.type)"
              class="flex items-center w-full gap-2 px-3 py-2 text-sm transition-colors rounded text-neutral-300 hover:bg-neutral-800"
            >
              <component :is="item.icon" class="w-4 h-4" />
              <span>{{ item.label }}</span>
            </button>
          </div>
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
import { ref, onMounted, onUnmounted } from 'vue'
import type { NodeEntity } from '@abuddy/api'
import { X, Plus } from 'lucide-vue-next'
import { getPaletteItems } from '../../config/node-config'

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
  'create-connected': [nodeType: string, sourceNodeId: string]
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

// Next step functionality
const showNextStepMenu = ref(false)
const paletteItems = getPaletteItems()

function handleCreateConnectedNode(nodeType: string) {
  if (!props.selectedNode?.id) return
  
  // Emit event to parent
  emit('create-connected', nodeType, props.selectedNode.id)
  
  // Close the menu
  showNextStepMenu.value = false
}

// Handle clicks outside dropdown to close it
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  const dropdown = document.querySelector('.next-step-dropdown')
  const trigger = document.querySelector('.next-step-trigger')
  
  if (showNextStepMenu.value && 
      dropdown && trigger &&
      !dropdown.contains(target) && 
      !trigger.contains(target)) {
    showNextStepMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style>

</style> 