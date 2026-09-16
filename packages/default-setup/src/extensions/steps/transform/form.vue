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
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Field Mappings
        </label>
        <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
          <div class="p-4 space-y-3">
            <div v-for="(mapping, index) in fieldMappings" :key="index" class="flex items-center gap-2">
              <input
                :value="mapping.target"
                type="text"
                placeholder="field"
                class="w-1/3 px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                @input="updateMapping(index, { target: ($event.target as HTMLInputElement).value })"
              />
              <input
                :value="mapping.source"
                type="text"
                placeholder="e.g. $.event.data.payload"
                class="flex-1 px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                @input="updateMapping(index, { source: ($event.target as HTMLInputElement).value })"
              />
              <button
                type="button"
                class="p-2 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700"
                title="Remove mapping"
                @click="removeMapping(index)"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200"
              @click="addMapping"
            >
              <Plus class="w-3 h-3" />
              Add mapping
            </button>
            <p class="text-xs text-neutral-600">
              Each field is set on <code class="text-neutral-400">params</code>; mapping <code class="text-neutral-400">input</code> replaces the previous step's result.
            </p>
          </div>
          <TipSection />
        </div>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import BaseForm from '@abuddy/ui/components/BaseForm'
import TipSection from '@abuddy/ui/components/TipSection'
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor'
import type { NodeEntity } from '@/__generated__/types'
import type { TransformNode, TransformOutputType } from './types'

type FieldMapping = NonNullable<TransformNode['fieldMappings']>[number]

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

const fieldMappings = computed<FieldMapping[]>(() => nodeData.value.fieldMappings ?? [])

const emitMappings = (mappings: FieldMapping[]) => emit('update-node', { fieldMappings: mappings })

const addMapping = () => emitMappings([...fieldMappings.value, { target: '', source: '' }])

const removeMapping = (index: number) => emitMappings(fieldMappings.value.filter((_, i) => i !== index))

const updateMapping = (index: number, change: Partial<FieldMapping>) =>
  emitMappings(fieldMappings.value.map((mapping, i) => (i === index ? { ...mapping, ...change } : mapping)))
</script>
