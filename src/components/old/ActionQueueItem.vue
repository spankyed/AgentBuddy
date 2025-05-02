<template>
  <div 
    :class="[
      'p-3 rounded-lg mb-2 border animate-fade-in transition-colors',
      getStatusClass()
    ]"
  >
    <div class="flex items-center">
      <span class="mr-2">
        <component :is="getStatusIcon()" />
      </span>
      <span class="text-sm font-medium text-neutral-100">
        {{ action.description }}
      </span>
      <span class="ml-auto text-xs text-neutral-500">
        {{ formatTime(action.timestamp) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle, Clock, Loader, XCircle } from 'lucide-vue-next'
import type { ActionItem } from '../types'

interface ActionQueueItemProps {
  action: ActionItem
}

const props = defineProps<ActionQueueItemProps>()

const getStatusIcon = () => {
  switch (props.action.status) {
    case 'completed':
      return { component: CheckCircle, props: { size: 16, class: 'text-success-400' } }
    case 'in-progress':
      return { component: Loader, props: { size: 16, class: 'text-warning-400 animate-spin' } }
    case 'failed':
      return { component: XCircle, props: { size: 16, class: 'text-error-400' } }
    case 'pending':
    default:
      return { component: Clock, props: { size: 16, class: 'text-neutral-400' } }
  }
}

const getStatusClass = () => {
  switch (props.action.status) {
    case 'completed':
      return 'bg-success-100 border-success-200'
    case 'in-progress':
      return 'bg-warning-50 border-warning-200'
    case 'failed':
      return 'bg-error-50 border-error-200'
    case 'pending':
    default:
      return 'bg-neutral-800 border-neutral-800'
  }
}

const formatTime = (timestamp: Date) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 