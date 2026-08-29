<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <!-- Flow Selection -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <label class="text-xs font-semibold tracking-wider uppercase text-neutral-500">
            Flow
          </label>
          <button
            v-if="selectedFlow"
            @click="openFlow"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 transition-colors rounded hover:bg-neutral-700/50 hover:text-blue-300"
            title="Open flow in flows editor"
          >
            <ExternalLink class="w-3 h-3" />
            Open Flow
          </button>
        </div>
        <ComboboxRoot
          :model-value="selectedFlow"
          ignore-filter
          class="relative w-full"
          :open="isFlowDropdownOpen"
          @update:open="isFlowDropdownOpen = $event"
          @update:model-value="handleFlowChange"
        >
          <ComboboxAnchor class="w-full">
            <ComboboxTrigger as-child>
              <div class="inline-flex items-center justify-between w-full gap-2 px-3 py-2.5 text-sm leading-none transition-all duration-200 border rounded-md outline-none bg-neutral-800/50 border-neutral-700 text-neutral-200 hover:border-neutral-600 focus-within:border-neutral-600 focus-within:bg-neutral-800/70" :data-open="isFlowDropdownOpen">
                <ComboboxInput
                  class="flex-1 bg-transparent outline-none placeholder-neutral-500"
                  :placeholder="selectedFlow ? '' : 'Select a flow...'"
                  :value="selectedFlow ? selectedFlow.label : flowQuery"
                  @input="flowQuery = ($event.target as HTMLInputElement).value"
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
                  v-if="filteredFlows.length === 0 && flowQuery !== ''"
                  class="relative px-4 py-2 cursor-default select-none text-neutral-400"
                >
                  No flows found.
                </div>
                <ComboboxGroup>
                  <ComboboxItem
                    v-for="flow in filteredFlows"
                    :key="flow.id"
                    :value="flow"
                    class="relative flex cursor-default select-none items-center px-3 py-2 mx-1 my-0.5 rounded-md text-sm text-neutral-200 data-[highlighted]:bg-neutral-700 data-[highlighted]:text-white"
                  >
                    <ComboboxItemIndicator
                      class="absolute left-2 inline-flex items-center justify-center opacity-0 data-[state=checked]:opacity-100"
                    >
                      <Check class="w-4 h-4 text-blue-500" />
                    </ComboboxItemIndicator>
                    <div class="flex-1 ml-6">
                      <div class="flex items-center justify-between">
                        <span>{{ flow.label }}</span>
                      </div>
                      <p v-if="flow.description" class="mt-1 text-xs text-neutral-500">
                        {{ flow.description }}
                      </p>
                    </div>
                  </ComboboxItem>
                </ComboboxGroup>
              </ComboboxViewport>
            </ComboboxContent>
          </ComboboxPortal>
        </ComboboxRoot>
        <p v-if="selectedFlow?.description" class="mt-2 text-xs text-neutral-600">
          {{ selectedFlow.description }}
        </p>
      </div>

      <!-- Entry Parameter -->
      <div v-if="selectedFlow" class="pt-6 border-t border-neutral-800">
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Entry Parameter
        </label>
        <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
          <div class="p-4">
            <div class="flex items-center gap-3">
              <div class="flex-1">
                <label class="flex items-baseline gap-1 mb-2 text-sm font-medium text-neutral-400">
                  Payload
                  <span class="text-xs text-neutral-600">(data passed to flow.entry event)</span>
                </label>
                <input
                  :value="entryPayload"
                  type="text"
                  placeholder="e.g. $.event.data.payload or $.lastStep.result"
                  class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                  @input="updateEntryPayload(($event.target as HTMLInputElement).value)"
                />
                <p class="mt-1.5 text-xs text-neutral-600">
                  This value will be passed as the payload to the flow's entry event (flow.entry)
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
import { Check, ChevronDown, ExternalLink } from 'lucide-vue-next'
import { applicationState } from '@/main'
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
import type { FlowEntity, NodeEntity } from '@app/api'
import type { FormResources } from '@/plugins/flows/types/form-props'
import { flowsId } from '@/plugins/flows/state'

const props = defineProps<{
  node: NodeEntity
  resources?: FormResources
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// UI state only
const flowQuery = ref('')
const isFlowDropdownOpen = ref(false)


const { startsWith } = useFilter({ sensitivity: 'base' })

// Get selected flow from flows list
const selectedFlow = computed(() => {
  const flowRef = (props.node as any).flowRef
  if (!flowRef || !props.resources?.flows) return null
  return props.resources.flows.find(f => f.id === flowRef) || null
})

// Entry payload (field mapping for entry parameter)
const entryPayload = computed(() => {
  const mappings = (props.node as any).fieldMappings
  if (!mappings) return ''
  const entryMapping = Array.isArray(mappings) 
    ? mappings.find((m: any) => m.target === 'payload')
    : (mappings.target === 'payload' ? mappings : null)
  return entryMapping?.source || ''
})

// Computed filtered lists
const filteredFlows = computed(() => {
  if (!props.resources?.flows) return []
  if (flowQuery.value === '') return props.resources.flows
  return props.resources.flows.filter((flow: FlowEntity) =>
    startsWith(flow.label, flowQuery.value)
  )
})

// Update handlers
const handleFlowChange = (flow: FlowEntity | null) => {
  flowQuery.value = ''
  isFlowDropdownOpen.value = false
  
  if (flow) {
    emit('update-node', {
      flowRef: flow.id,
      fieldMappings: []
    })
  } else {
    emit('update-node', {
      flowRef: undefined,
      fieldMappings: []
    })
  }
}

const updateEntryPayload = (source: string) => {
  const mapping = source.trim() 
    ? [{ target: 'payload', source, default: undefined }]
    : []
  
  emit('update-node', { fieldMappings: mapping })
}

const openFlow = () => {
  if (selectedFlow.value) {
    // Navigate to the flow in flows plugin
    const flowsActor = applicationState.system.get(flowsId);
    flowsActor.send({ type: 'FLOW.SELECT', flowId: selectedFlow.value.id });
  }
}
</script>

