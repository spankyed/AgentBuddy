<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <EntityTypeInput
        :model-value="nodeData.entityTypeTarget"
        @update:model-value="$emit('update-node', { entityTypeTarget: $event })"
      />
      <Fields
        :model-value="nodeData.fieldMappings"
        @update:model-value="$emit('update-node', { fieldMappings: $event })"
      />
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
        <p class="mt-1.5 text-xs text-neutral-600">
          Without a <code class="text-neutral-400">label</code> field, label the entity from its title, name or topic
        </p>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeEntity } from '@/__generated__/types'
import BaseForm from '@abuddy/ui/components/BaseForm'
import type { CreateNode } from './types'
import Fields from './fields.vue'
import EntityTypeInput from './entity-type-input.vue'

const props = defineProps<{
  node: NodeEntity
}>()

defineEmits<{
  'update-node': [updates: Partial<CreateNode>]
  'close': []
}>()

const nodeData = computed(() => props.node as CreateNode)
</script>
