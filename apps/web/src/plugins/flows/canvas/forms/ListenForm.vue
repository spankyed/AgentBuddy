<template>
  <BaseForm 
    v-if="node"
    :node="nodeData"
    @update-label="updateLabel"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        MODE
      </label>
      <select
        :value="mode"
        @change="updateMode(($event.target as HTMLSelectElement).value)"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="entry">Entry</option>
        <option value="internal">Internal</option>
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        EVENT TAG
      </label>
      <input
        :value="eventType"
        @input="updateEventType(($event.target as HTMLInputElement).value)"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="mode === 'entry'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        DEBOUNCE (MS)
      </label>
      <input
        :value="debounceMs || ''"
        @input="updateDebounce(($event.target as HTMLInputElement).value)"
        type="number"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="mode === 'internal'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        SCOPE
      </label>
      <select
        :value="scope"
        @change="updateScope(($event.target as HTMLSelectElement).value)"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="local">Local</option>
        <option value="global">Global</option>
      </select>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EARS } from '@abuddy/api'
import BaseForm from './BaseForm.vue'
import { useNodeForm } from '../../composables/use-node-viewmodel'
import type { ListenNodeView } from '../../types/view-models'

const props = defineProps<{
  nodeId: EARS.EntityId
}>()

const { node, extension, updateNode, updateLabel } = useNodeForm(props.nodeId)

const listenExtension = computed(() => 
  extension.value?.type === 'listen' ? extension.value as ListenNodeView : null
)

const nodeData = computed(() => ({
  id: props.nodeId,
  nodeType: node.value?.nodeType || 'listen',
  label: node.value?.label || ''
}))

const mode = computed(() => listenExtension.value?.mode || 'entry')
const eventType = computed(() => listenExtension.value?.eventType || '')
const debounceMs = computed(() => listenExtension.value?.debounceMs)
const scope = computed(() => listenExtension.value?.scope || 'local')

const updateMode = (value: string) => {
  updateNode({ mode: value as 'entry' | 'internal' })
}

const updateEventType = (value: string) => {
  updateNode({ eventType: value })
}

const updateDebounce = (value: string) => {
  updateNode({ debounceMs: parseInt(value) || 0 })
}

const updateScope = (value: string) => {
  updateNode({ scope: value as 'local' | 'global' })
}
</script>
