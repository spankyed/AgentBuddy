<template>
  <div class="flex flex-col h-full bg-neutral-900/50 backdrop-blur-sm">


    <!-- Content -->
    <div class="flex-1 overflow-hidden">
      <div v-if="filteredFlows.length > 0" class="h-full p-4 overflow-y-auto">
        <div class="space-y-1">
          <FlowItem
            v-for="flow in filteredFlows"
            :key="flow.id"
            :flow="flow"
            :is-selected="flow.id === selectedFlowId"
            :is-multi-selected="multiSelectedFlowIds?.has(flow.id!)"
            :is-root="flow.id === rootFlowId"
            @click="$emit('flow-click', flow, $event)"
            @dblclick="$emit('flow-dblclick', flow)"
            @request-delete="$emit('request-delete', $event)"
            @request-edit-label="$emit('request-edit-label', $event)"
          />
        </div>
      </div>

      <!-- No search results -->
      <div v-else-if="isSearchMode && searchQuery.trim()" class="flex flex-col items-center justify-center h-full px-6 text-center">
        <div class="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-neutral-800/30">
          <Search class="w-6 h-6 text-neutral-500" />
        </div>
        <p class="text-sm text-neutral-400">No flows match "{{ searchQuery }}"</p>
      </div>

      <!-- Empty state -->
      <div v-else class="flex flex-col items-center justify-center h-full px-6 text-center">
        <div class="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-neutral-800/30">
          <Workflow class="w-6 h-6 text-neutral-500" />
        </div>
        <p class="text-sm font-medium text-neutral-300">No flows yet</p>
        <p class="mt-1 text-xs text-neutral-500">Create your first flow to get started</p>
      </div>
    </div>

    <!-- Footer with Create button -->
    <div class="flex-shrink-0 p-4 border-t border-neutral-800/50">
      <!-- Default state: Create and Search buttons -->
      <div v-if="!isSearchMode" class="flex gap-2">
        <Button 
          variant="transparent"
          class="!p-2 !h-auto text-neutral-300 hover:text-white hover:bg-white/[0.03]" 
          @click="handleSearchClick" 
          title="Search flows"
        >
          <Search class="w-4 h-4" />
        </Button>
        <Button 
          class="flex-1 !text-[0.8125rem] !font-medium !py-2 !px-3 text-center flex items-center justify-center"
          data-onboarding-id="flow-create-button"
          @click="$emit('create-flow')"
        >
          <span>New Flow</span>
        </Button>

      </div>
      
      <!-- Search mode -->
      <div v-else class="flex items-center gap-2">
        <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-3.5 h-3.5" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          class="w-full py-2 pr-8 text-xs transition-all duration-200 border rounded-md outline-none pl-9 bg-neutral-800/50 border-neutral-700/50 text-neutral-100 placeholder-neutral-500 focus:border-neutral-600 focus:bg-neutral-800/70"
          placeholder="Search flows..."
          @keyup.escape="closeSearch"
        />
        <button 
          class="absolute p-1 transition-colors -translate-y-1/2 rounded right-2 top-1/2 hover:bg-neutral-700/50 text-neutral-500 hover:text-neutral-300"
          @click="closeSearch"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { Workflow, Search, X } from 'lucide-vue-next'
import type { FlowEntity } from '@app/api'
import FlowItem from './FlowItem.vue'
import uFuzzy from '@leeoniya/ufuzzy'
import Button from '@/core/components/design/button.vue'

interface Props {
  flows: Partial<FlowEntity>[]
  rootFlowId?: string | null
  selectedFlowId?: string | null
  multiSelectedFlowIds?: Set<string>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'flow-click': [flow: Partial<FlowEntity>, event: MouseEvent]
  'flow-dblclick': [flow: Partial<FlowEntity>]
  'create-flow': []
  'request-delete': [flow: Partial<FlowEntity>]
  'request-edit-label': [flow: Partial<FlowEntity>]
}>()

// Search state
const isSearchMode = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

// Initialize uFuzzy instance
const fuzzy = new uFuzzy({
  intraMode: 1,
  interLft: 2,
  intraSub: 1,
  intraTrn: 1,
  intraDel: 1,
  intraIns: 1
})

// Handle search button click
const handleSearchClick = () => {
  isSearchMode.value = true
  nextTick(() => {
    searchInput.value?.focus()
  })
}

// Close search
const closeSearch = () => {
  isSearchMode.value = false
  searchQuery.value = ''
}

// Watch for search mode changes to ensure focus
watch(isSearchMode, (newValue) => {
  if (newValue) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// Filtered flows based on search query
const filteredFlows = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.flows
  }
  
  const haystack = props.flows.map(flow => {
    const label = flow.label || (flow.id === props.rootFlowId ? 'Main Flow' : `Flow ${flow.id}`)
    const description = flow.description || ''
    return `${label} ${description}`.toLowerCase()
  })
  
  const idxs = fuzzy.search(haystack, searchQuery.value.toLowerCase())
  
  if (!idxs) {
    return []
  }
  
  const [matchedIndexes, info, order] = idxs
  
  if (!order || !matchedIndexes) {
    return []
  }
  
  return order.map(i => props.flows[matchedIndexes[i]])
})
</script>

<style>
</style> 