<template>
  <div class="flex flex-col h-full p-0 overflow-hidden">
    <!-- Root flow section -->
    <div v-if="rootFlow" class="flex flex-shrink-0 px-3 pt-4">
      <div class="flex items-center flex-shrink-0 mr-2 text-neutral-500">
        <span class="text-[0.625rem] font-medium uppercase tracking-wider pl-2">Root</span>
      </div>
      <button
        class="w-full group flex items-center gap-2 px-2 py-1.5 rounded-md text-neutral-100 cursor-pointer text-[0.8125rem] transition-all duration-200 hover:bg-white/[0.03]"
        :class="{ 
          'bg-purple-500/10 text-purple-300 hover:bg-purple-500/15': rootFlow.id === selectedFlowId,
          'hover:bg-white/[0.03]': rootFlow.id !== selectedFlowId
        }"
        @click="$emit('flow-click', rootFlow)"
      >
        <div class="relative flex items-center justify-center flex-shrink-0 w-6 h-6 transition-all duration-200 rounded"
             :class="rootFlow.id === selectedFlowId ? 'bg-purple-500/15 group-hover:bg-purple-500/20' : 'bg-purple-500/10 group-hover:bg-purple-500/15'">
          <Brain 
            class="w-3.5 h-3.5 transition-colors text-purple-400" 
          />
        </div>
        <div class="flex-1 min-w-0 text-left">
          <div class="font-medium truncate">{{ rootFlow.label || 'Main Flow' }}</div>
        </div>
      </button>
    </div>

    <!-- Sub flows section -->
    <div v-if="flows.length > 0 || isSearchMode" class="flex flex-col flex-1 min-h-0 px-3 pb-3 overflow-hidden">
      <!-- Section divider -->
      <div v-if="rootFlow" class="flex items-center gap-2 mt-3 mb-3">
        <span class="text-[0.625rem] font-medium uppercase tracking-wider text-neutral-500 px-2">Sub-Flows</span>
        <div class="flex-1 h-[0.0625rem] bg-gradient-to-l from-transparent to-neutral-700/30"></div>
      </div>
      
      <!-- Sub flows list -->
      <div class="flex-1 px-1 -mx-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
        <button
          v-for="flow in filteredFlows"
          :key="flow.id"
          class="w-full group flex items-center gap-2 mb-0.5 px-2 py-1.5 rounded-md text-neutral-100 cursor-pointer text-[0.8125rem] transition-all duration-200 hover:bg-white/[0.03]"
          :class="{ 
            'bg-blue-500/10 text-blue-300 hover:bg-blue-500/15': flow.id === selectedFlowId,
            'hover:bg-white/[0.03]': flow.id !== selectedFlowId
          }"
          @click="$emit('flow-click', flow)"
        >
          <div class="relative flex items-center justify-center flex-shrink-0 w-6 h-6 transition-all duration-200 rounded"
               :class="flow.id === selectedFlowId ? 'bg-blue-500/15 group-hover:bg-blue-500/20' : 'bg-blue-500/10 group-hover:bg-blue-500/15'">
            <Workflow 
              class="w-3.5 h-3.5 transition-colors text-blue-400"
            />
          </div>
          <div class="flex-1 min-w-0 text-left">
            <div class="font-medium truncate">{{ flow.label || `Flow ${flow.id}` }}</div>
            <div v-if="flow.description" class="text-[0.6875rem] text-neutral-400 truncate mt-0.5" :class="{ 'text-blue-300/60': flow.id === selectedFlowId }">
              {{ flow.description }}
            </div>
          </div>
        </button>
        
        <!-- No search results message -->
        <div v-if="isSearchMode && filteredFlows.length === 0 && searchQuery.trim()" class="flex flex-col items-center justify-center h-32 gap-2 py-8 text-center">
          <div class="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800/50">
            <Search class="w-5 h-5 text-neutral-500" />
          </div>
          <p class="m-0 text-[0.75rem] text-neutral-400">No flows match "{{ searchQuery }}"</p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!rootFlow && flows.length === 0" class="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <div class="flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10">
        <Workflow class="w-6 h-6 text-purple-400" />
      </div>
      <div>
        <p class="m-0 text-[0.875rem] font-medium text-neutral-100">No flows yet</p>
        <p class="m-0 mt-1 text-[0.75rem] text-neutral-400">Create your first flow to get started</p>
      </div>
    </div>

    <!-- Create new flow section -->
    <div class="flex-shrink-0 p-3">
      <!-- Default state: Create and Search buttons -->
      <div v-if="!isSearchMode" class="flex gap-2">
        <Button 
          class="flex-1 !text-[0.8125rem] !font-medium !py-2 !px-3"
          @click="$emit('create-flow')"
        >
          <Plus class="w-4 h-4" />
          <span>New Flow</span>
        </Button>
        <Button 
          variant="transparent"
          class="!p-2 !h-auto text-neutral-300 hover:text-white hover:bg-white/[0.03]" 
          @click="handleSearchClick" 
          title="Search flows"
        >
          <Search class="w-4 h-4" />
        </Button>
      </div>
      
      <!-- Search mode -->
      <div v-else class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute -translate-y-1/2 left-3 top-1/2 text-neutral-400 w-3.5 h-3.5" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="w-full py-2 pr-3 text-[0.8125rem] transition-all duration-200 border border-neutral-700 rounded-md outline-none pl-9 bg-neutral-800 text-neutral-100 focus:border-primary-400/50 focus:bg-neutral-900"
            placeholder="Search flows..."
            @keyup.escape="isSearchMode = false; searchQuery = ''"
          />
        </div>
        <Button 
          variant="transparent" 
          class="!p-2 !h-auto text-neutral-300 hover:text-white hover:bg-white/[0.03]"
          @click="isSearchMode = false; searchQuery = ''"
        >
          <X class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { Brain, Workflow, Search, Plus, X } from 'lucide-vue-next'
import type { FlowEntity } from '@abuddy/api'
import Button from '@/core/design/button.vue'
import uFuzzy from '@leeoniya/ufuzzy'

interface Props {
  flows: Partial<FlowEntity>[]
  rootFlow?: Partial<FlowEntity> | undefined
  selectedFlowId?: string | null
}

const props = defineProps<Props>()

defineEmits<{
  'flow-click': [flow: Partial<FlowEntity>]
  'create-flow': []
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
    const label = flow.label || `Flow ${flow.id}`
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
.scrollbar-thin::-webkit-scrollbar {
  width: 0.375rem;
}

.scrollbar-thin::-webkit-scrollbar-track {
  @apply bg-transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  @apply bg-neutral-600/50 rounded;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-500/50;
}
</style> 