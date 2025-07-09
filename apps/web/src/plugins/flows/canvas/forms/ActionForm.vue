<template>
  <BaseForm
    :node="node"
    @update-label="handleUpdateLabel"
  >
    <div class="space-y-6">
      <!-- Action Selection -->
      <div>
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Action
        </label>
        <ComboboxRoot
          v-model="selectedAction"
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

      <!-- Field Mappings -->
      <div v-if="selectedAction" class="pt-6 border-t border-neutral-800">
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Field Mappings
        </label>
        <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
          <div v-if="Object.keys(selectedAction.input || {}).length === 0" class="p-4 text-sm text-neutral-600">
            No input fields required for this action.
          </div>
          <div v-else class="p-4 space-y-4">
            <div
              v-for="(param, key) in selectedAction.input"
              :key="key"
              class="flex items-center gap-3"
            >
              <div class="flex-1">
                <label class="flex items-baseline gap-1 mb-2 text-sm font-medium text-neutral-400">
                  {{ param.name || key }}
                  <span v-if="param.required" class="text-xs text-red-500">*</span>
                  <span class="text-xs text-neutral-600">({{ param.type }})</span>
                </label>
                <input
                  :value="fieldMappings.find(m => m.target === key.toString())?.source || ''"
                  type="text"
                  :placeholder="param.placeholder || `e.g. $.event.data.${key}`"
                  class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                  @input="handleParameterChange(key.toString(), ($event.target as HTMLInputElement).value)"
                />
                <p v-if="param.description" class="mt-1.5 text-xs text-neutral-600">
                  {{ param.description }}
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
import { ref, computed, watch, watchEffect, onMounted } from 'vue'
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
import type { ActionNode, ActionNodeEnriched, ActionEntity } from '@abuddy/api'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { flowsId } from '../../state'

const props = defineProps<{
  node: ActionNode | ActionNodeEnriched
}>()

const emit = defineEmits<{
  'update-node': [data: Partial<ActionNode>]
}>()

// Get flows actor for accessing actions
const flowsActor = applicationState.system.get(flowsId)
const actions = useSelector(flowsActor, (state: any) => state.context.actions)

// Local state
const selectedAction = ref<ActionEntity | null>(null)
const actionQuery = ref('')
const fieldMappings = ref<Array<{ target: string; source: string; default?: any }>>([])
const isActionDropdownOpen = ref(false)

const { startsWith } = useFilter({ sensitivity: 'base' })

// Check if node is enriched
const isEnriched = computed(() => 'action' in props.node)

// Use enriched data if available, otherwise find from list
const initialAction = computed(() => {
  if (isEnriched.value) {
    const enrichedNode = props.node as ActionNodeEnriched
    if (enrichedNode.action) {
      return enrichedNode.action
    }
    // actionId is only available on enriched nodes
    return enrichedNode.actionId ? actions.value.find(a => a.id === enrichedNode.actionId) : null
  }
  return null
})

// Initialize form data
onMounted(() => {
  // Set initial value if available
  if (initialAction.value) {
    selectedAction.value = initialAction.value
    fieldMappings.value = props.node.fieldMappings || []
  }
})


// Computed filtered actions
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

// Clear query when dropdown closes
watch(isActionDropdownOpen, (newValue) => {
  if (!newValue) {
    actionQuery.value = ''
  }
})

// Handlers
const handleUpdateLabel = (label: string) => {
  emit('update-node', { ...props.node, label })
}

const handleActionChange = (action: ActionEntity | null) => {
  selectedAction.value = action
  actionQuery.value = ''
  
  // Reset field mappings for new action
  const newMappings: Array<{ target: string; source: string; default?: any }> = []
  if (action?.input) {
    Object.keys(action.input).forEach(key => {
      const existing = fieldMappings.value.find(m => m.target === key)
      newMappings.push({
        target: key,
        source: existing?.source || '',
        default: existing?.default
      })
    })
  }
  fieldMappings.value = newMappings
  
  // Update node with actionId for backend to create/update relationship
  // Create update object based on whether node is enriched
  const update: any = {
    ...props.node,
    fieldMappings: newMappings,
  }
  
  // Add actionId only if it exists on the enriched node or if we have an action
  if (action && (isEnriched.value || 'actionId' in props.node)) {
    update.actionId = action.id
  }
  
  emit('update-node', update)
}

const handleParameterChange = (field: string, value: string) => {
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

<style scoped>
/* Hide default details disclosure triangle */
summary::-webkit-details-marker {
  display: none;
}
</style>