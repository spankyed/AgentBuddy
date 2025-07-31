<template>
  <BaseForm 
    v-if="node"
    :node="node"
    @update-label="$emit('update-node', { label: $event })"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ENTITY TYPE
      </label>
      <select
        :value="nodeData.entityTypeTarget || 'thread'"
        @change="$emit('update-node', { entityTypeTarget: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="thread">Thread</option>
        <option value="message">Message</option>
        <option value="node">Node</option>
        <option value="flow">Flow</option>
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ENTITY ID (OPTIONAL)
      </label>
      <input
        :value="nodeData.entityId || ''"
        @input="$emit('update-node', { entityId: ($event.target as HTMLInputElement).value || undefined })"
        placeholder="Auto-generated if empty"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="flex items-center text-sm text-neutral-200">
        <input
          type="checkbox"
          :checked="nodeData.inferLabel ?? true"
          @change="$emit('update-node', { inferLabel: ($event.target as HTMLInputElement).checked })"
          class="mr-2 rounded border-neutral-700 bg-neutral-800 text-blue-500 focus:ring-2 focus:ring-blue-500"
        />
        <span class="text-xs font-medium uppercase tracking-wider text-neutral-400">INFER LABEL</span>
      </label>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeEntity } from '@app/api'
import BaseForm from './BaseForm.vue'

const props = defineProps<{
  node: NodeEntity
}>()

defineEmits<{
  'update-node': [updates: Record<string, any>]
}>()

// Type assertion for create node properties
const nodeData = computed(() => props.node as any)
</script>
