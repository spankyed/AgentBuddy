<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <!-- Prompt -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Request
        </label>
        <textarea
          :value="nodeData.prompt || ''"
          rows="4"
          placeholder="e.g. The 10 most recent threads with their topic and status"
          class="w-full px-3 py-2 text-sm border rounded-md resize-y bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          @input="$emit('update-node', { prompt: ($event.target as HTMLTextAreaElement).value })"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          The model turns this into a read-only database query, which runs when the step does.
        </p>
      </div>

      <!-- Model -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Model
        </label>
        <select
          :value="nodeData.model || ''"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          @change="$emit('update-node', { model: ($event.target as HTMLSelectElement).value || undefined })"
        >
          <option value="">Default ({{ DEFAULT_MODEL }})</option>
          <option v-if="nodeData.model && !listed" :value="nodeData.model">{{ nodeData.model }}</option>
          <optgroup v-for="(group, provider) in groupedModels" :key="provider" :label="providerLabels[provider]">
            <option v-for="model in group" :key="model.id" :value="model.id">{{ model.name }}</option>
          </optgroup>
        </select>
      </div>

      <!-- Result key -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Result Key
        </label>
        <input
          :value="nodeData.resultKey || ''"
          type="text"
          :placeholder="DEFAULT_RESULT_KEY"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          @input="$emit('update-node', { resultKey: ($event.target as HTMLInputElement).value || undefined })"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          The result is <code class="text-neutral-400">{ query, {{ nodeData.resultKey || DEFAULT_RESULT_KEY }} }</code>: read the rows at <code class="text-neutral-400">$.lastStep.result.{{ nodeData.resultKey || DEFAULT_RESULT_KEY }}</code>.
        </p>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseForm from '@abuddy/ui/components/BaseForm'
import type { NodeEntity } from '@/__generated__/types'
import type { FormResources } from '@/features/flows/fe/types/form-props'
import { parseModelId, providerLabels, type ModelCatalogEntry, type ProviderName } from '@abuddy/sdk/models'
import { DEFAULT_MODEL } from '../llm/model'
import { DEFAULT_RESULT_KEY } from './result-key'
import type { QueryNode } from './types'

const props = defineProps<{
  node: NodeEntity
  resources?: FormResources
}>()

defineEmits<{
  'update-node': [updates: Record<string, unknown>]
  'close': []
}>()

const nodeData = computed(() => props.node as Partial<QueryNode>)

const listed = computed(() => props.resources?.models?.some((model) => model.id === nodeData.value.model) ?? false)

const groupedModels = computed(() => {
  const groups: Partial<Record<ProviderName, ModelCatalogEntry[]>> = {}
  for (const model of props.resources?.models ?? []) {
    const parts = parseModelId(model.id)
    if (parts) (groups[parts.provider] ??= []).push(model)
  }
  return groups
})
</script>
