<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-label="$emit('update-node', { label: $event })"
  >
    <div class="space-y-6">
      <!-- Model Selection -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Model
        </label>
        <ComboboxRoot
          :model-value="selectedModel"
          ignore-filter
          class="relative w-full"
          :open="isModelDropdownOpen"
          @update:open="isModelDropdownOpen = $event"
          @update:model-value="handleModelChange"
        >
          <ComboboxAnchor class="w-full">
            <ComboboxTrigger as-child>
              <div class="inline-flex items-center justify-between w-full gap-2 px-3 py-2.5 text-sm leading-none transition-all duration-200 border rounded-md outline-none bg-neutral-800/50 border-neutral-700 text-neutral-200 hover:border-neutral-600 focus-within:border-neutral-600 focus-within:bg-neutral-800/70" :data-open="isModelDropdownOpen">
                <ComboboxInput
                  class="flex-1 bg-transparent outline-none placeholder-neutral-500"
                  :placeholder="selectedModel ? '' : 'Select a model...'"
                  :value="selectedModel ? selectedModel.name : modelQuery"
                  @input="modelQuery = ($event.target as HTMLInputElement).value"
                />
                <ChevronDown class="w-4 h-4 text-neutral-400" />
              </div>
            </ComboboxTrigger>
          </ComboboxAnchor>
          <ComboboxPortal>
            <ComboboxContent
              position="popper"
              side="bottom"
              align="start"
              :side-offset="4"
              class="z-10 max-w-[400px] overflow-hidden border rounded-md shadow-xl bg-neutral-800 border-neutral-700"
            >
              <ComboboxViewport class="overflow-y-auto max-h-60">
                <div
                  v-if="filteredModels.length === 0 && modelQuery !== ''"
                  class="relative px-4 py-2 cursor-default select-none text-neutral-400"
                >
                  No models found.
                </div>
              <div v-for="(group, provider) in groupedModels" :key="provider">
                <div v-if="group.length > 0" class="sticky top-0 z-10 px-3 py-2 text-xs font-semibold border-b text-neutral-400 bg-neutral-800 border-neutral-700">
                  {{ provider }}
                </div>
                <ComboboxGroup>
                  <ComboboxItem
                    v-for="model in group"
                    :key="model.id"
                    :value="model"
                    class="relative flex cursor-default select-none items-center px-3 py-2 mx-1 my-0.5 rounded-md text-sm text-neutral-200 data-[highlighted]:bg-neutral-700 data-[highlighted]:text-white"
                  >
                    <ComboboxItemIndicator
                      class="absolute left-2 inline-flex items-center justify-center opacity-0 data-[state=checked]:opacity-100"
                    >
                      <Check class="w-4 h-4 text-blue-500" />
                    </ComboboxItemIndicator>
                    <div class="flex-1 ml-6">
                      <div class="flex items-center justify-between">
                        <span>{{ model.name }}</span>
                        <span v-if="model.contextWindow" class="text-xs text-neutral-500">
                          {{ formatContextWindow(model.contextWindow) }}
                        </span>
                      </div>
                      <p v-if="model.description" class="mt-1 text-xs text-neutral-500">
                        {{ model.description }}
                      </p>
                    </div>
                  </ComboboxItem>
                </ComboboxGroup>
              </div>
              </ComboboxViewport>
            </ComboboxContent>
          </ComboboxPortal>
        </ComboboxRoot>
        <div v-if="selectedModel" class="flex items-center gap-3 mt-2 text-xs text-neutral-600">
          <span v-if="selectedModel.contextWindow" class="flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {{ formatContextWindow(selectedModel.contextWindow) }}
          </span>
          <span v-if="selectedModel.costPer1kInput && selectedModel.costPer1kOutput" class="flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ${{ selectedModel.costPer1kInput }}/1k in, ${{ selectedModel.costPer1kOutput }}/1k out
          </span>
        </div>
      </div>
      
      <!-- Prompt Template Dropdown -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Prompt Template
        </label>
        <ComboboxRoot
          :model-value="selectedPrompt"
          ignore-filter
          class="relative w-full"
          :open="isPromptDropdownOpen"
          @update:open="isPromptDropdownOpen = $event"
          @update:model-value="handlePromptChange"
        >
          <ComboboxAnchor class="w-full">
            <ComboboxTrigger as-child>
              <div class="inline-flex items-center justify-between w-full gap-2 px-3 py-2.5 text-sm leading-none transition-all duration-200 border rounded-md outline-none bg-neutral-800/50 border-neutral-700 text-neutral-200 hover:border-neutral-600 focus-within:border-neutral-600 focus-within:bg-neutral-800/70" :data-open="isPromptDropdownOpen">
                <ComboboxInput
                  class="flex-1 bg-transparent outline-none placeholder-neutral-500"
                  :placeholder="selectedPrompt ? '' : 'Select a prompt template...'"
                  :value="selectedPrompt ? selectedPrompt.label : promptQuery"
                  @input="promptQuery = ($event.target as HTMLInputElement).value"
                />
                <ChevronDown class="w-4 h-4 text-neutral-400" />
              </div>
            </ComboboxTrigger>
          </ComboboxAnchor>
          <ComboboxPortal>
            <ComboboxContent
              position="popper"
              side="bottom"
              align="start"
              :side-offset="4"
              class="z-10 max-w-[400px] overflow-hidden border rounded-md shadow-xl bg-neutral-800 border-neutral-700"
            >
              <ComboboxViewport class="overflow-y-auto max-h-60">
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
                  class="relative flex cursor-default select-none items-center px-3 py-2 mx-1 my-0.5 rounded-md text-sm text-neutral-200 data-[highlighted]:bg-neutral-700 data-[highlighted]:text-white"
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
          </ComboboxPortal>
        </ComboboxRoot>
        <p v-if="selectedPrompt?.description" class="mt-2 text-xs text-neutral-600">
          {{ selectedPrompt.description }}
        </p>
      </div>

      <!-- Available Context Info -->
      <div v-if="selectedPrompt" class="pt-6 border-t border-neutral-800">
        <details class="group">
          <summary class="flex items-center text-xs font-semibold tracking-wider uppercase list-none cursor-pointer text-neutral-500 hover:text-neutral-400">
            <ChevronRight class="w-3 h-3 mr-2 transition-transform group-open:rotate-90" />
            Available Context
          </summary>
          <div class="p-3 mt-3 font-mono text-xs border rounded-md bg-neutral-800/30 border-neutral-700 text-neutral-500">
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

      <!-- Field Mappings with Optimized Updates -->
      <div v-if="selectedPrompt" class="pt-6 border-t border-neutral-800">
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Field Mappings
        </label>
        <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
          <div v-if="!promptInputKeys.length" class="p-4 text-sm text-neutral-600">
            No input fields required for this prompt template.
          </div>
          <div v-else class="p-4 space-y-4">
            <div
              v-for="key in promptInputKeys"
              :key="key"
              class="flex items-center gap-3"
            >
              <div class="flex-1">
                <label class="flex items-baseline gap-1 mb-2 text-sm font-medium text-neutral-400">
                  {{ key }}
                  <span v-if="selectedPrompt.inputs[key].required" class="text-xs text-red-500">*</span>
                </label>
                <input
                  :value="getFieldMapping(key)"
                  type="text"
                  :placeholder="`e.g. $.event.data.${key}`"
                  class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                  @input="updateFieldMapping(key, ($event.target as HTMLInputElement).value)"
                />
                <p v-if="selectedPrompt.inputs[key].description" class="mt-1.5 text-xs text-neutral-600">
                  {{ selectedPrompt.inputs[key].description }}
                </p>
              </div>
            </div>
          </div>
          <TipSection :example-categories="tipExamples" />
        </div>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check, ChevronDown, ChevronRight } from 'lucide-vue-next'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
  useFilter
} from 'reka-ui'
import BaseForm from './BaseForm.vue'
import TipSection from '../components/TipSection.vue'
import type { ModelConfig, PromptEntity, NodeEntity } from '@app/api'
import type { FormResources } from '../../types/form-props'

const props = defineProps<{
  node: NodeEntity
  resources?: FormResources
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
}>()

// Type assertion for llm node properties
const nodeData = computed(() => props.node as any)

// UI state
const promptQuery = ref('')
const isPromptDropdownOpen = ref(false)
const modelQuery = ref('')
const isModelDropdownOpen = ref(false)

// Tip examples configuration
const tipExamples = [
  {
    label: 'Context Variables',
    examples: ['$.event.data.text', '$.lastStep.result', '$.context.userId', '$.history[0]']
  },
  {
    label: 'System Variables',
    examples: ['$.timestamp', '$.flowId', '$.sessionId', '$.variables.*']
  }
]

const { startsWith } = useFilter({ sensitivity: 'base' })

// Get selected model and prompt
const selectedModel = computed(() => {
  if (!nodeData.value.model || !props.resources?.models) return null
  return props.resources.models.find((m: ModelConfig) => m.id === nodeData.value.model) || null
})

const selectedPrompt = computed(() => {
  if (!nodeData.value.promptTemplateId || !props.resources?.prompts) return null
  return props.resources.prompts.find((p: PromptEntity) => p.id === nodeData.value.promptTemplateId) || null
})

// Field mappings
const fieldMappings = computed(() => {
  const mappings = nodeData.value.fieldMappings
  if (!mappings) return []
  return Array.isArray(mappings) ? mappings : [mappings]
})

// Computed filtered lists
const filteredPrompts = computed(() => {
  if (!props.resources?.prompts) return []
  if (promptQuery.value === '') return props.resources.prompts
  return props.resources.prompts.filter((prompt: PromptEntity) =>
    startsWith(prompt.label, promptQuery.value)
  )
})

const filteredModels = computed(() => {
  if (!props.resources?.models) return []
  if (modelQuery.value === '') return props.resources.models
  return props.resources.models.filter((model: ModelConfig) =>
    startsWith(model.name, modelQuery.value) ||
    startsWith(model.provider, modelQuery.value)
  )
})

// Group models by provider
const groupedModels = computed(() => {
  const groups: Record<string, ModelConfig[]> = {}
  filteredModels.value.forEach((model: ModelConfig) => {
    if (!groups[model.provider]) {
      groups[model.provider] = []
    }
    groups[model.provider].push(model)
  })
  return groups
})

// Prompt input keys
const promptInputKeys = computed(() => 
  selectedPrompt.value?.inputs ? Object.keys(selectedPrompt.value.inputs) : []
)

// Helper functions
const formatContextWindow = (tokens: number) => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K tokens`
  }
  return `${tokens} tokens`
}

// Field mapping helpers
const getFieldMapping = (target: string): string => {
  const mapping = fieldMappings.value.find((m: any) => m.target === target)
  return mapping?.source || ''
}

const updateFieldMapping = (target: string, source: string) => {
  const currentMappings = fieldMappings.value.filter((m: any) => m.target !== target)
  
  if (source.trim()) {
    currentMappings.push({ target, source, default: undefined })
  }
  
  emit('update-node', { fieldMappings: currentMappings })
}

// Update handlers
const handlePromptChange = (prompt: PromptEntity | null) => {
  promptQuery.value = ''
  isPromptDropdownOpen.value = false
  
  if (prompt) {
    // Create default mappings for new prompt
    const newMappings = prompt.inputs ? Object.keys(prompt.inputs).map(key => ({
      target: key,
      source: `$.event.data.${key}`,
      default: undefined
    })) : []
    
    emit('update-node', {
      promptTemplateId: prompt.id,
      fieldMappings: newMappings
    })
  } else {
    emit('update-node', {
      promptTemplateId: undefined,
      fieldMappings: []
    })
  }
}

const handleModelChange = (model: ModelConfig | null) => {
  modelQuery.value = ''
  isModelDropdownOpen.value = false
  emit('update-node', { model: model?.id || undefined })
}
</script>

<style scoped>
/* Hide default details disclosure triangle */
summary::-webkit-details-marker {
  display: none;
}
</style> 