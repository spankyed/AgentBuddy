<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <!-- Header with mode toggle -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <label class="text-xs font-semibold tracking-wider uppercase text-neutral-500">
            {{ isCodeMode ? 'Inline Code' : 'Template' }}
          </label>
          <div class="flex items-center gap-2">
            <button
              @click="toggleMode"
              class="p-1 rounded transition-colors"
              :class="isCodeMode
                ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50'"
              :title="isCodeMode ? 'Switch to template mode' : 'Switch to code mode'"
            >
              <Code class="w-3.5 h-3.5" />
            </button>
            <template v-if="!isCodeMode">
              <button
                v-if="selectedAction"
                @click="viewAction"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 transition-colors rounded hover:bg-neutral-700/50 hover:text-blue-300"
                title="View action details"
              >
                <ExternalLink class="w-3 h-3" />
                Edit Template
              </button>
              <button
                @click="createAction"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 transition-colors rounded hover:bg-neutral-700/50 hover:text-blue-300"
                title="Create new action"
              >
                <Plus class="w-3 h-3" />
                New Action
              </button>
            </template>
          </div>
        </div>

        <!-- Code Mode -->
        <template v-if="isCodeMode">
          <div>
            <p class="mb-3 text-xs text-neutral-500">
              An async function body receiving <code class="text-neutral-400">params</code>, <code class="text-neutral-400">services</code>, <code class="text-neutral-400">z</code>, and <code class="text-neutral-400">flowId</code>.
            </p>
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 250px;">
              <SimpleMonacoEditor
                :model-value="(node as any).actionFn || ''"
                language="typescript"
                :function-body="true"
                dsl-type="action"
                :dsl-params="codeDslParams"
                :options="codeEditorOptions"
                @update:model-value="updateActionFn"
              />
            </div>
          </div>
        </template>

        <!-- Template Mode (existing action selection) -->
        <template v-else>
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
                    {{ category }}
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
        </template>
      </div>

      <!-- Field Mappings (template mode only) -->
      <div v-if="!isCodeMode && selectedAction" class="pt-6 border-t border-neutral-800">
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
                  {{ key }}
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
          <TipSection />
        </div>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check, ChevronDown, Code, ExternalLink, Plus } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { navigateToPlugin } from '@/core/utils/navigate'
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
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue'
import type { ActionEntity, NodeEntity } from '@app/api'
import type { FormResources } from '../../types/form-props'

const props = defineProps<{
  node: NodeEntity
  resources?: FormResources
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// UI state only
const actionQuery = ref('')
const isActionDropdownOpen = ref(false)

const { startsWith } = useFilter({ sensitivity: 'base' })

// Mode
const isCodeMode = computed(() => (props.node as any).mode === 'code')

const toggleMode = () => {
  const newMode = isCodeMode.value ? 'template' : 'code'
  emit('update-node', { mode: newMode })
}

// Code mode config
const codeDslParams = {
  event: { type: 'ExecutionEvent' },
  steps: { type: 'StepRun[]' },
  lastStep: { type: 'Omit<StepRun, "timestamp">' },
}

const codeEditorOptions = {
  lineNumbers: 'off' as const,
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 8,
  lineNumbersMinChars: 0,
}

const updateActionFn = (code: string) => {
  emit('update-node', { actionFn: code })
}

// Get selected action from actions list
const selectedAction = computed(() => {
  const actionId = (props.node as any).actionId
  if (!actionId || !props.resources?.actions) return null
  return props.resources.actions.find(a => a.id === actionId) || null
})

// Field mappings
const fieldMappings = computed(() => {
  const mappings = (props.node as any).fieldMappings
  if (!mappings) return []
  return Array.isArray(mappings) ? mappings : [mappings]
})

// Computed filtered lists
const filteredActions = computed(() => {
  if (!props.resources?.actions) return []
  if (actionQuery.value === '') return props.resources.actions
  return props.resources.actions.filter((action: ActionEntity) =>
    startsWith(action.label, actionQuery.value)
  )
})

// Group actions by category
const groupedActions = computed(() => {
  const groups: Record<string, ActionEntity[]> = {}
  filteredActions.value.forEach((action: ActionEntity) => {
    const category = action.category || 'None'
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
const handleActionChange = (action: ActionEntity | null) => {
  actionQuery.value = ''
  isActionDropdownOpen.value = false

  if (action) {
    emit('update-node', {
      actionId: action.id,
      fieldMappings: []
    })
  } else {
    emit('update-node', {
      actionId: undefined,
      fieldMappings: []
    })
  }
}

const createAction = () => {
  navigateToPlugin('actions', { type: 'ACTION.CREATE' });
}

const viewAction = () => {
  if (selectedAction.value) {
    navigateToPlugin('actions', { type: 'ACTION.SELECT', actionId: selectedAction.value.id });
  }
}
</script>
