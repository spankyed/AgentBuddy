<template>
  <div>
    <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
      {{ label }}
    </label>
    <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
      <div class="p-4 space-y-2">
        <div v-for="(mapping, index) in mappings" :key="index" class="flex items-center gap-2">
          <input
            :value="mapping.target"
            placeholder="field"
            class="w-1/4 px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
            @input="change(index, { target: ($event.target as HTMLInputElement).value })"
          />
          <input
            :value="mapping.source"
            :placeholder="sourcePlaceholder"
            class="flex-1 px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
            @input="change(index, { source: ($event.target as HTMLInputElement).value })"
          />
          <input
            :value="writtenDefault(mapping.default)"
            placeholder="fallback"
            title="Used when the source resolves to nothing. Leave empty for no fallback."
            class="w-1/5 px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
            @input="changeDefault(index, ($event.target as HTMLInputElement).value)"
          />
          <button
            type="button"
            class="p-1.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50"
            :title="`Remove ${itemName}`"
            @click="remove(index)"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 rounded hover:bg-neutral-700/50 hover:text-blue-300"
          @click="add"
        >
          <Plus class="w-3 h-3" />
          Add {{ itemName }}
        </button>
        <p class="text-xs text-neutral-600">
          <slot name="hint">
            A source starting with <code class="text-neutral-400">$.</code> is read from the flow when the step runs; any other is a value (JSON when it parses).
          </slot>
          A fallback is used when the source resolves to nothing, and reads the same way.
        </p>
      </div>
      <TipSection />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import TipSection from '@apack/ui/components/TipSection'
import type { FieldMapping } from '@apack/sdk/steps'
import { withDefault, writtenDefault } from './field-default.ts'

// One editor for every step that maps fields. The transform step had a second copy of it, which is how the two
// came to word the same hint differently; what actually differs between them is the wording, so that is props.
const props = withDefaults(defineProps<{
  modelValue?: FieldMapping[]
  label?: string
  itemName?: string
  sourcePlaceholder?: string
}>(), {
  modelValue: undefined,
  label: 'Fields',
  itemName: 'field',
  sourcePlaceholder: '$.lastStep.result.text or a value',
})

const emit = defineEmits<{ 'update:modelValue': [mappings: FieldMapping[]] }>()

const mappings = computed(() => props.modelValue ?? [])

const add = () => emit('update:modelValue', [...mappings.value, { target: '', source: '' }])
const remove = (index: number) => emit('update:modelValue', mappings.value.filter((_, i) => i !== index))
const change = (index: number, patch: Partial<FieldMapping>) =>
  emit('update:modelValue', mappings.value.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)))

const changeDefault = (index: number, typed: string) =>
  emit('update:modelValue', mappings.value.map((mapping, i) => (i === index ? withDefault(mapping, typed) : mapping)))
</script>
