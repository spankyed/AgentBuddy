<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Target
        </label>
        <input
          :value="nodeData.target || ''"
          placeholder="$.lastStep.result.id or an entity id"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          @input="$emit('update-node', { target: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <Fields
        :model-value="nodeData.fieldMappings"
        @update:model-value="$emit('update-node', { fieldMappings: $event })"
      />
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          When Missing
        </label>
        <select
          :value="nodeData.onMissing || 'fail'"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          @change="$emit('update-node', { onMissing: ($event.target as HTMLSelectElement).value as UpdateOnMissing })"
        >
          <option value="fail">Fail the step</option>
          <option value="ignore">Skip the update</option>
          <option value="create">Create the entity</option>
        </select>
      </div>
      <EntityTypeInput
        v-if="nodeData.onMissing === 'create'"
        :model-value="nodeData.entityTypeTarget"
        @update:model-value="$emit('update-node', { entityTypeTarget: $event })"
      />
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeEntity } from '@/__generated__/types'
import BaseForm from '@abuddy/ui/components/BaseForm'
import Fields from '../create/fields.vue'
import EntityTypeInput from '../create/entity-type-input.vue'
import type { UpdateNode, UpdateOnMissing } from './types'

const props = defineProps<{
  node: NodeEntity
}>()

defineEmits<{
  'update-node': [updates: Partial<UpdateNode>]
  'close': []
}>()

const nodeData = computed(() => props.node as UpdateNode)
</script>
