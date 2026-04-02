<template>
  <div v-if="selectedNode">
    <!-- Backdrop overlay -->
    <div
      class="absolute top-0 left-0 w-full h-full bg-black/30 z-[5]"
      @click="$emit('close')"
    />

    <!-- Slide-in form -->
    <div
      class="absolute top-0 right-0 w-2/5 h-full z-[6] flex"
    >
      <!-- Form content -->
      <div class="flex-1 bg-neutral-800" data-onboarding-id="flow-node-form">
        <component
          :is="getFormComponent(selectedNode.nodeType)"
          :key="selectedNode.id"
          :node="selectedNode"
          :resources="{ actions, flows, models, prompts }"
          @update-node="handleUpdateNode"
          @reindex-branches="handleReindexBranches"
          @close="$emit('close')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue'
import type { NodeEntity, ActionEntity, FlowEntity, ModelConfig, PromptEntity } from '@app/api'

// Form components
import BaseForm from '../forms/BaseForm.vue'
import ListenerForm from '../forms/ListenerForm.vue'
import FireForm from '../forms/FireForm.vue'
import CreateForm from '../forms/CreateForm.vue'
import LLMForm from '../forms/LLMForm.vue'
import ActionForm from '../forms/ActionForm.vue'
import FlowForm from '../forms/FlowForm.vue'
import SwitchForm from '../forms/SwitchForm.vue'

interface Props {
  selectedNode?: NodeEntity | null
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelConfig[]
  prompts?: PromptEntity[]
  edges?: { id: string; source: string; target: string; sourceHandle?: string }[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close': []
  'update-node': [nodeId: string, updates: Record<string, any>]
  'reindex-branches': [nodeId: string, data: { type: 'inserted' | 'removed'; index: number }]
  'create-connected': [nodeType: string, sourceNodeId: string]
}>()

function handleUpdateNode(updates: Record<string, any>) {
  if (props.selectedNode?.id) {
    emit('update-node', props.selectedNode.id, updates)
  }
}

function handleReindexBranches(data: { type: 'inserted' | 'removed'; index: number }) {
  if (props.selectedNode?.id) {
    emit('reindex-branches', props.selectedNode.id, data)
  }
}

function getFormComponent(nodeType: string) {
  const formMap: Record<string, any> = {
    'listener': ListenerForm,
    'fire': FireForm,
    'create': CreateForm,
    'llm': LLMForm,
    'action': ActionForm,
    'flow': FlowForm,
    'switch': SwitchForm,
  }
  return formMap[nodeType] || BaseForm
}

// Next step functionality
const showNextStepMenu = ref(false)

const hasOutputConnection = computed(() => {
  if (!props.selectedNode?.id || !props.edges) return false
  return props.edges.some(edge => edge.source === props.selectedNode!.id)
})

// Provide next-step state for BaseForm to render
provide('nextStep', {
  show: computed(() => !hasOutputConnection.value),
  showMenu: showNextStepMenu,
  handleCreate: (nodeType: string) => {
    if (!props.selectedNode?.id) return
    emit('create-connected', nodeType, props.selectedNode.id)
    showNextStepMenu.value = false
  },
})

// Watch for selected node changes and reset menu state
watch(() => props.selectedNode?.id, () => {
  showNextStepMenu.value = false
})
</script>
