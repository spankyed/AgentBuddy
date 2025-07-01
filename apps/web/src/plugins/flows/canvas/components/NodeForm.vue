<template>
  <div v-if="selectedNode">
    <!-- Backdrop overlay -->
    <div 
      class="absolute top-0 left-0 w-full h-full bg-black/70 z-[5]" 
      @click="$emit('close')" 
    />
    
    <!-- Slide-in form -->
    <div 
      class="flex absolute top-0 right-0 w-2/5 h-full transform transition-transform duration-300 ease-in-out z-[6] overflow-y-auto overflow-x-hidden scrollbar-thin"
      :class="selectedNode ? 'translate-x-0' : 'translate-x-full'"
    >
      <component
        :is="getFormComponent(selectedNode.nodeType)"
        :node="selectedNode"
        @update-label="handleUpdateLabel"
        @update-description="handleUpdateDescription"
        @update-config="handleUpdateConfig"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NodeEntity } from '@abuddy/api'

// Form components
import BaseForm from '../forms/BaseForm.vue'
import ListenForm from '../forms/ListenForm.vue'
import FireForm from '../forms/FireForm.vue'
import CreateForm from '../forms/CreateForm.vue'

interface Props {
  selectedNode?: NodeEntity | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close': []
  'update-label': [nodeId: string, label: string]
  'update-description': [nodeId: string, description: string]
  'update-config': [nodeId: string, config: Record<string, any>]
}>()

function handleUpdateLabel(label: string) {
  if (props.selectedNode?.id) {
    emit('update-label', props.selectedNode.id, label)
  }
}

function handleUpdateDescription(description: string) {
  if (props.selectedNode?.id) {
    emit('update-description', props.selectedNode.id, description)
  }
}

function handleUpdateConfig(config: Record<string, any>) {
  if (props.selectedNode?.id) {
    emit('update-config', props.selectedNode.id, config)
  }
}

function getFormComponent(nodeType: string) {
  const formMap: Record<string, any> = {
    'listen': ListenForm,
    'fire': FireForm,
    'create': CreateForm,
  }
  return formMap[nodeType] || BaseForm
}
</script>

<style>
.scrollbar-thin::-webkit-scrollbar {
  @apply w-1.5;
}

.scrollbar-thin::-webkit-scrollbar-track {
  @apply bg-transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  @apply bg-neutral-600 rounded;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-500;
}
</style> 