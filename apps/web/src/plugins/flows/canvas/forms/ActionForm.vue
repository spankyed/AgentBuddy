<template>
  <BaseForm
    v-if="node"
    :node="nodeData"
    @update-label="updateLabel"
  >
    <div class="space-y-6">
      <!-- Action Selection -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Action
        </label>
        <ComboboxRoot
          :model-value="selectedAction"
          ignore-filter
          class="relative w-full"
          :open="isActionDropdownOpen"
          @update:open="isActionDropdownOpen = $event"
          @update:model-value="handleActionChange"
        >
          <ComboboxAnchor class="w-full">
            <ComboboxTrigger as-child>
              <div class="inline-flex items-center justify-between w-full gap-2 px-3 py-2.5 text-sm leading-none transition-all duration-200 border rounded-md outline-none bg-neutral-800/50 border-neutral-700 text-neutral-200 hover:border-neutral-600 focus-within:border-neutral-600 focus-within:bg-neutral-800/70" :data-open="isActionDropdownOpen">
                <ComboboxInput
                  class="flex-1 bg-transparent outline-none placeholder-neutral-500"
                  :placeholder="selectedAction ? '' : 'Select an action...'"
                  :value="selectedAction ? selectedAction.label : actionQuery"
                  @input="actionQuery = ($event.target as HTMLInputElement).value"
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
                  v-if="filteredActions.length === 0 && actionQuery !== ''"
                  class="relative px-4 py-2 cursor-default select-none text-neutral-400"
                >
                  No actions found.
                </div>
              <div v-for="(group, category) in groupedActions" :key="category">
                <div v-if="group.length > 0" class="sticky top-0 z-10 px-3 py-2 text-xs font-semibold border-b text-neutral-400 bg-neutral-800 border-neutral-700">
                  {{ category || 'Uncategorized' }}
                </div>
                <ComboboxGroup>
                  <ComboboxItem
                    v-for="action in group"
                    :key="action.id"
                    :value="action"
                    class="relative flex cursor-default select-none items-center px-3 py-2 mx-1 my-0.5 rounded-md text-sm text-neutral-200 data-[highlighted]:bg-neutral-700 data-[highlighted]:text-white"
                  >
                    <ComboboxItemIndicator
                      class="absolute left-2 inline-flex items-center justify-center opacity-0 data-[state=checked]:opacity-100"
                    >
                      <Check class="w-4 h-4 text-blue-500" />
                    </ComboboxItemIndicator>
                    <div class="flex-1 ml-6">
                      <div class="flex items-center justify-between">
                        <span>{{ action.label }}</span>
                      </div>
                      <p v-if="action.description" class="mt-1 text-xs text-neutral-500">
                        {{ action.description }}
                      </p>
                    </div>
                  </ComboboxItem>
                </ComboboxGroup>
              </div>
              </ComboboxViewport>
            </ComboboxContent>
          </ComboboxPortal>
        </ComboboxRoot>
        <p v-if="selectedAction?.description" class="mt-2 text-xs text-neutral-600">
          {{ selectedAction.description }}
        </p>
      </div>

      <!-- Available Context Info -->
      <div v-if="selectedAction" class="pt-6 border-t border-neutral-800">
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
      <div v-if="selectedAction" class="pt-6 border-t border-neutral-800">
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Field Mappings
        </label>
        <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
          <div v-if="!actionInputKeys.length" class="p-4 text-sm text-neutral-600">
            No input fields required for this action.
          </div>
          <div v-else class="p-4 space-y-4">
            <div
              v-for="key in actionInputKeys"
              :key="key"
              class="flex items-center gap-3"
            >
              <div class="flex-1">
                <label class="flex items-baseline gap-1 mb-2 text-sm font-medium text-neutral-400">
                  {{ selectedAction.input[key].name || key }}
                  <span v-if="selectedAction.input[key].required" class="text-xs text-red-500">*</span>
                  <span class="text-xs text-neutral-600">({{ selectedAction.input[key].type }})</span>
                </label>
                <input
                  :value="getFieldMapping(key)"
                  type="text"
                  :placeholder="selectedAction.input[key].placeholder || `e.g. $.event.data.${key}`"
                  class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                  @input="updateFieldMapping(key, ($event.target as HTMLInputElement).value)"
                />
                <p v-if="selectedAction.input[key].description" class="mt-1.5 text-xs text-neutral-600">
                  {{ selectedAction.input[key].description }}
                </p>
              </div>
            </div>
          </div>
          <div class="px-4 py-3 border-t border-neutral-700 bg-neutral-800/50">
            <p class="text-xs text-neutral-500">
              <span class="font-medium">Tip:</span> Use JSONPath expressions like <code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.event.data.text</code> or <code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.lastStep.result</code> to map values, or enter literal values like <code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">"hello"</code> or <code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">123</code>
            </p>
          </div>
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
import type { ActionEntity, EARS } from '@abuddy/api'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { flowsId } from '../../state'
import { useNodeForm } from '../../composables/use-node-viewmodel'
import { createDefaultMappings } from '../../types/view-models'
import type { ActionNodeView } from '../../types/view-models'

const props = defineProps<{
  nodeId: EARS.EntityId
}>()

// Single source of truth - no dual updates
const { node, extension, updateNode, updateLabel } = useNodeForm(props.nodeId)

// Get flows actor for accessing actions list
const flowsActor = applicationState.system.get(flowsId)
const actions = useSelector(flowsActor, (state: any) => state.context.actions)

// UI state only - no data duplication
const actionQuery = ref('')
const isActionDropdownOpen = ref(false)

const { startsWith } = useFilter({ sensitivity: 'base' })

// Type-safe extension access
const actionExtension = computed(() => 
  extension.value?.type === 'action' ? extension.value as ActionNodeView : null
)

// Stable computed references
const selectedAction = computed(() => actionExtension.value?.action)

// Optimized field mappings using Map for O(1) access
const fieldMappingsMap = computed(() => {
  const mappings = new Map<string, string>()
  actionExtension.value?.fieldMappings?.forEach(mapping => {
    mappings.set(mapping.target, mapping.source)
  })
  return mappings
})

// Create compatible node data for BaseForm
const nodeData = computed(() => ({
  id: props.nodeId,
  nodeType: node.value?.nodeType || 'action',
  label: node.value?.label || ''
}))

// Computed filtered lists
const filteredActions = computed(() => {
  if (actionQuery.value === '') return actions.value
  return actions.value.filter((action: ActionEntity) =>
    startsWith(action.label, actionQuery.value)
  )
})

// Group actions by category
const groupedActions = computed(() => {
  const groups: Record<string, ActionEntity[]> = {}
  filteredActions.value.forEach((action: ActionEntity) => {
    const category = action.category || 'Uncategorized'
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(action)
  })
  return groups
})

// Action input keys
const actionInputKeys = computed(() => 
  selectedAction.value?.input ? Object.keys(selectedAction.value.input) : []
)

// Field mapping helpers
const getFieldMapping = (target: string): string => {
  return fieldMappingsMap.value.get(target) || ''
}

const updateFieldMapping = (target: string, source: string) => {
  // Create new array with updated mapping
  const currentMappings = actionExtension.value?.fieldMappings || []
  const newMappings = currentMappings.filter(m => m.target !== target)
  
  if (source.trim()) {
    newMappings.push({ target, source, default: undefined })
  }
  
  updateNode({ fieldMappings: newMappings })
}

// Single update handlers - no emit needed
const handleActionChange = (action: ActionEntity | null) => {
  actionQuery.value = ''
  isActionDropdownOpen.value = false
  
  if (action) {
    const newMappings = createDefaultMappings(action.input)
    updateNode({
      actionId: action.id,
      fieldMappings: newMappings
    })
  } else {
    updateNode({
      actionId: undefined,
      fieldMappings: []
    })
  }
}
</script>

<style scoped>
/* Hide default details disclosure triangle */
summary::-webkit-details-marker {
  display: none;
}
</style>