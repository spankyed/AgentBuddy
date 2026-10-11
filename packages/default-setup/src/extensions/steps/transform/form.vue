<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <!-- Script -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Script
        </label>
        <p class="mb-3 text-xs text-neutral-500">
          An async function body receiving <code class="text-neutral-400">params</code> (<code class="text-neutral-400">params.input</code> is the previous step's result, then the mapped fields) and <code class="text-neutral-400">services</code>. Return the output.
        </p>
        <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 250px;">
          <SimpleMonacoEditor
            :model-value="nodeData.script || ''"
            language="typescript"
            :function-body="true"
            dsl-type="action"
            :options="codeEditorOptions"
            @update:model-value="$emit('update-node', { script: $event })"
          />
        </div>
      </div>

      <!-- Output type -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Output
        </label>
        <div class="flex overflow-hidden border rounded-lg border-neutral-700">
          <button
            v-for="option in outputOptions"
            :key="option.value"
            type="button"
            :class="[
              'flex-1 px-3 py-2 text-xs font-medium transition-all duration-200',
              outputType === option.value
                ? 'bg-neutral-300/20 text-neutral-300'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'
            ]"
            @click="$emit('update-node', { outputType: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="mt-3 text-xs text-neutral-600">
          {{ outputOptions.find((option) => option.value === outputType)?.description }}
        </p>
      </div>

      <!-- Field mappings -->
      <div class="pt-6 border-t border-neutral-800">
        <Fields
          label="Field Mappings"
          item-name="mapping"
          source-placeholder="e.g. $.event.data.payload"
          :model-value="nodeData.fieldMappings"
          @update:model-value="$emit('update-node', { fieldMappings: $event })"
        >
          <template #hint>
            Each field is set on <code class="text-neutral-400">params</code>; mapping <code class="text-neutral-400">input</code> replaces the previous step's result.
          </template>
        </Fields>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseForm from '@apack/ui/components/BaseForm'
import SimpleMonacoEditor from '@apack/ui/components/SimpleMonacoEditor'
import Fields from '../create/fields.vue'
import type { NodeEntity } from '#generated/types.ts'
import type { TransformNode, TransformOutputType } from './types.ts'

const props = defineProps<{
  node: NodeEntity
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, unknown>]
  'close': []
}>()

const nodeData = computed(() => props.node as Partial<TransformNode>)
const outputType = computed<TransformOutputType>(() => nodeData.value.outputType ?? 'json')

const outputOptions: Array<{ value: TransformOutputType; label: string; description: string }> = [
  { value: 'json', label: 'JSON', description: 'The returned value, which must be JSON-serializable' },
  { value: 'text', label: 'Text', description: 'The returned value as a string' },
  { value: 'custom', label: 'Custom', description: 'The returned value as it is' },
]

const codeEditorOptions = {
  lineNumbers: 'off' as const,
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 8,
  lineNumbersMinChars: 0,
}

</script>
