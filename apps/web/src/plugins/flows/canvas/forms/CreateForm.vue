<template>
  <BaseForm 
    v-if="node"
    :node="nodeData"
    @update-label="updateLabel"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ENTITY TYPE
      </label>
      <select
        :value="entityTypeTarget"
        @change="updateEntityType(($event.target as HTMLSelectElement).value)"
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
        :value="entityId"
        @input="updateEntityId(($event.target as HTMLInputElement).value)"
        placeholder="Auto-generated if empty"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="flex items-center text-sm text-neutral-200">
        <input
          type="checkbox"
          :checked="inferLabel"
          @change="updateInferLabel(($event.target as HTMLInputElement).checked)"
          class="mr-2 rounded border-neutral-700 bg-neutral-800 text-blue-500 focus:ring-2 focus:ring-blue-500"
        />
        <span class="text-xs font-medium uppercase tracking-wider text-neutral-400">INFER LABEL</span>
      </label>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EARS } from '@abuddy/api'
import BaseForm from './BaseForm.vue'
import { useNodeForm } from '../../composables/use-node-viewmodel'
import type { CreateNodeView } from '../../types/view-models'

const props = defineProps<{
  nodeId: EARS.EntityId
}>()

const { node, extension, updateNode, updateLabel } = useNodeForm(props.nodeId)

const createExtension = computed(() => 
  extension.value?.type === 'create' ? extension.value as CreateNodeView : null
)

const nodeData = computed(() => ({
  id: props.nodeId,
  nodeType: node.value?.nodeType || 'create',
  label: node.value?.label || ''
}))

const entityTypeTarget = computed(() => createExtension.value?.entityTypeTarget || 'thread')
const entityId = computed(() => createExtension.value?.entityId || '')
const inferLabel = computed(() => createExtension.value?.inferLabel ?? true)

const updateEntityType = (value: string) => {
  updateNode({ entityTypeTarget: value as EARS.Entity })
}

const updateEntityId = (value: string) => {
  updateNode({ entityId: value || undefined })
}

const updateInferLabel = (value: boolean) => {
  updateNode({ inferLabel: value })
}
</script>
