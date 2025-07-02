<template>
  <BaseForm
    :node="node"
    @update-label="handleUpdateLabel"
    @update-description="handleUpdateDescription"
  >
    <div class="space-y-4">
      <!-- Prompt Template Dropdown -->
      <div>
        <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
          PROMPT TEMPLATE
        </label>
        <ComboboxRoot
          v-model="selectedPrompt"
          ignore-filter
          class="relative w-full"
          :open="isOpen"
          @update:open="isOpen = $event"
          @update:model-value="handlePromptChange"
        >
          <ComboboxAnchor class="w-full">
            <ComboboxTrigger as-child>
              <div class="inline-flex items-center justify-between rounded-md px-3 py-2 text-sm leading-none gap-2 bg-neutral-800 border border-neutral-700 text-neutral-200 outline-none w-full hover:border-neutral-600 focus-within:border-neutral-600 transition-all duration-200" :data-open="isOpen">
                <ComboboxInput
                  class="flex-1 bg-transparent outline-none placeholder-neutral-500"
                  placeholder="Select a prompt template..."
                  v-model="promptQuery"
                />
                <ChevronDown class="w-4 h-4 text-neutral-400" />
              </div>
            </ComboboxTrigger>
          </ComboboxAnchor>
          <ComboboxContent
            class="absolute z-10 w-full mt-1 overflow-hidden bg-neutral-800 border border-neutral-700 rounded-md shadow-lg"
            :style="{ top: '100%' }"
          >
            <ComboboxViewport class="max-h-60 overflow-y-auto p-1">
              <div
                v-if="filteredPrompts.length === 0 && promptQuery !== ''"
                class="relative px-4 py-2 cursor-default select-none text-neutral-400"
              >
                No prompts found.
              </div>
              <ComboboxGroup>
                <ComboboxItem
                  v-for="prompt in filteredPrompts"
                  :key="prompt.id"
                  :value="prompt"
                  class="relative flex cursor-default select-none items-center rounded-md px-3 py-2 text-sm text-neutral-200 data-[highlighted]:bg-neutral-700 data-[highlighted]:text-white"
                >
                  <ComboboxItemIndicator
                    class="absolute left-2 inline-flex items-center justify-center opacity-0 data-[state=checked]:opacity-100"
                  >
                    <Check class="w-4 h-4 text-blue-500" />
                  </ComboboxItemIndicator>
                  <span class="ml-6">{{ prompt.label }}</span>
                </ComboboxItem>
              </ComboboxGroup>
            </ComboboxViewport>
          </ComboboxContent>
        </ComboboxRoot>
        <p v-if="selectedPrompt?.description" class="mt-2 text-xs text-neutral-500">
          {{ selectedPrompt.description }}
        </p>
      </div>

      <!-- Field Mappings -->
      <div v-if="selectedPrompt">
        <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
          FIELD MAPPINGS
        </label>
        <div class="p-4 border rounded-md bg-neutral-800 border-neutral-700">
          <div v-if="Object.keys(selectedPrompt.inputs || {}).length === 0" class="text-sm text-neutral-500">
            No input fields required for this prompt template.
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(input, key) in selectedPrompt.inputs"
              :key="key"
              class="flex items-center gap-3"
            >
              <div class="flex-1">
                <label class="block text-sm font-medium text-neutral-300 mb-1">
                  {{ input.label || key }}
                  <span v-if="input.required" class="text-red-400">*</span>
                </label>
                <input
                  :value="fieldMappings.find(m => m.target === key.toString())?.source || ''"
                  type="text"
                  :placeholder="input.description || `Map to ${key}`"
                  class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-900 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  @input="handleFieldMappingChange(key.toString(), ($event.target as HTMLInputElement).value)"
                />
                <p v-if="input.description" class="mt-1 text-xs text-neutral-500">
                  {{ input.description }}
                </p>
              </div>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-neutral-700">
            <p class="text-xs text-neutral-500">
              Use JSONPath expressions to map fields from the execution context.
              Examples: $.event.data.text, $.lastStep.result
            </p>
          </div>
        </div>
      </div>

      <!-- Available Context Info -->
      <div class="mt-4">
        <details class="group">
          <summary class="cursor-pointer text-xs font-medium uppercase tracking-wider text-neutral-400 hover:text-neutral-300">
            Available Context
            <ChevronRight class="inline w-3 h-3 ml-1 transition-transform group-open:rotate-90" />
          </summary>
          <div class="mt-2 p-3 text-xs font-mono rounded-md bg-neutral-900 border border-neutral-700 text-neutral-400">
            <div class="space-y-2">
              <div>
                <span class="text-blue-400">$.event</span>
                <div class="ml-4">
                  <div>.type <span class="text-neutral-600">// Event type</span></div>
                  <div>.data <span class="text-neutral-600">// Event payload data</span></div>
                  <div>.timestamp <span class="text-neutral-600">// When event occurred</span></div>
                </div>
              </div>
              <div>
                <span class="text-blue-400">$.lastStep</span>
                <div class="ml-4">
                  <div>.result <span class="text-neutral-600">// Previous step output</span></div>
                  <div>.id <span class="text-neutral-600">// Step ID</span></div>
                  <div>.label <span class="text-neutral-600">// Step label</span></div>
                </div>
              </div>
              <div>
                <span class="text-blue-400">$.steps</span> <span class="text-neutral-600">// Array of all step results</span>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, ChevronDown, ChevronRight } from 'lucide-vue-next'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
  useFilter
} from 'reka-ui'
import BaseForm from './BaseForm.vue'
import type { LLMNode } from '@abuddy/api'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { flowsId } from '../../state'

const props = defineProps<{
  node: LLMNode
}>()

const emit = defineEmits<{
  'update-node': [data: Partial<LLMNode>]
}>()

// Get flows actor and prompts from state
const flowsActor = applicationState.system.get(flowsId)
const prompts = useSelector(flowsActor, (state: any) => state.context.prompts || [])

// Local state
const selectedPrompt = ref<any>(null)
const promptQuery = ref('')
const fieldMappings = ref<Array<{ target: string; source: string; default?: any }>>([])
const isOpen = ref(false)

const { startsWith } = useFilter({ sensitivity: 'base' })

// Initialize from node data
if (props.node.promptTemplateId) {
  const prompt = prompts.value.find(p => p.id === props.node.promptTemplateId)
  if (prompt) {
    selectedPrompt.value = prompt
    fieldMappings.value = props.node.fieldMappings || []
  }
}

// Computed filtered prompts
const filteredPrompts = computed(() => {
  if (promptQuery.value === '') return prompts.value
  
  return prompts.value.filter((prompt) =>
    startsWith(prompt.label, promptQuery.value)
  )
})

// Handlers
const handleUpdateLabel = (label: string) => {
  emit('update-node', { ...props.node, label })
}

const handleUpdateDescription = (description: string) => {
  emit('update-node', { ...props.node, description })
}

const handlePromptChange = (prompt: any) => {
  selectedPrompt.value = prompt
  
  // Reset field mappings for new prompt
  const newMappings: Array<{ target: string; source: string; default?: any }> = []
  if (prompt?.inputs) {
    Object.keys(prompt.inputs).forEach(key => {
      const existing = fieldMappings.value.find(m => m.target === key)
      newMappings.push({
        target: key,
        source: existing?.source || '',
        default: existing?.default
      })
    })
  }
  fieldMappings.value = newMappings
  
  // Update node
  emit('update-node', {
    ...props.node,
    promptTemplateId: prompt?.id || '',
    fieldMappings: newMappings
  })
}

const handleFieldMappingChange = (field: string, value: string) => {
  const index = fieldMappings.value.findIndex(m => m.target === field)
  if (index >= 0) {
    fieldMappings.value[index].source = value
  } else {
    fieldMappings.value.push({ target: field, source: value })
  }
  
  emit('update-node', {
    ...props.node,
    fieldMappings: [...fieldMappings.value]
  })
}
</script>