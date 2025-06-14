<template>
  <div class="flex flex-col h-full p-0 overflow-hidden">
    <!-- Root flow section -->
    <div v-if="rootFlow" class="flex flex-shrink-0 px-3 pt-5">
      <div class="flex items-center flex-shrink-0 mr-3 text-neutral-500">
        <span class="text-[10px] font-medium uppercase tracking-wider pl-2 mr-1">Root</span>
      </div>
      <button
        class="w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-100 cursor-pointer text-sm transition-all duration-200 hover:bg-neutral-700 active:scale-[0.98]"
        :class="{ 
          'bg-primary-500/20 text-primary-300 border border-primary-500/40 hover:bg-primary-500/30': rootFlow.id === selectedFlowId,
          'hover:bg-neutral-700': rootFlow.id !== selectedFlowId
        }"
        @click="$emit('flow-click', rootFlow)"
      >
      <ArrowRightFromLine 
        class="transition-colors group-hover:text-primary-4300" 
        :size="13" 
      />
        <div class="flex-1 min-w-0 text-left">
          <div class="font-medium truncate">{{ rootFlow.label || 'Main Flow' }}</div>
          <!-- <div v-if="rootFlow.description" class="text-xs text-neutral-400 truncate mt-0.5" :class="{ 'text-primary-200/70': rootFlow.id === selectedFlowId }">
            {{ rootFlow.description }}
          </div> -->
        </div>
      </button>
    </div>

    <!-- Sub flows section -->
    <div v-if="flows.length > 0 || isSearchMode" class="flex flex-col flex-1 min-h-0 px-3 pb-3 overflow-hidden">
      <!-- Section divider -->
      <div v-if="rootFlow" class="flex items-center gap-2 mt-3 mb-4">
        <span class="text-[10px] font-medium uppercase tracking-wider text-neutral-500 px-2">Sub-Flows</span>
        <div class="flex-1 h-px bg-gradient-to-l from-transparent to-neutral-600"></div>
      </div>
      
      <!-- Sub flows list -->
      <div class="flex-1 px-1 -mx-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
        <button
          v-for="flow in filteredFlows"
          :key="flow.id"
          class="w-full group flex items-center gap-3 mb-1 px-3 py-2 rounded-lg text-neutral-100 cursor-pointer text-sm transition-all duration-200 hover:bg-neutral-700 active:scale-[0.98]"
          :class="{ 
            'bg-primary-500/20 text-primary-300 border border-primary-500/40 hover:bg-primary-500/30': flow.id === selectedFlowId,
            'hover:bg-neutral-700': flow.id !== selectedFlowId
          }"
          @click="$emit('flow-click', flow)"
        >
          <div class="flex-shrink-0">
            <ArrowRight 
              class="transition-colors text-neutral-300 group-hover:text-primary-400" 
              :class="{ 'text-primary-400': flow.id === selectedFlowId }" 
              :size="16" 
            />
          </div>
          <div class="flex-1 min-w-0 text-left">
            <div class="font-medium truncate">{{ flow.label || `Flow ${flow.id}` }}</div>
            <div v-if="flow.description" class="text-xs text-neutral-400 truncate mt-0.5" :class="{ 'text-primary-200/70': flow.id === selectedFlowId }">
              {{ flow.description }}
            </div>
          </div>
        </button>
        
        <!-- No search results message -->
        <div v-if="isSearchMode && filteredFlows.length === 0 && searchQuery.trim()" class="flex flex-col items-center justify-center h-32 gap-2 py-8 text-center">
          <Search class="text-neutral-500" :size="20" />
          <p class="m-0 text-xs text-neutral-400">No flows match "{{ searchQuery }}"</p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!rootFlow && flows.length === 0" class="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <div class="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-700">
        <Workflow class="text-neutral-500" :size="24" />
      </div>
      <div>
        <p class="m-0 text-sm font-medium text-neutral-300">No flows yet</p>
        <p class="m-0 mt-1 text-xs text-neutral-500">Create your first flow to get started</p>
      </div>
    </div>

    <!-- Create new flow section -->
    <div class="flex-shrink-0 p-3">
      <!-- Default state: Create and Search buttons -->
      <div v-if="!isSearchMode" class="flex gap-2">
        <Button 
          class="flex-1 !text-sm !font-medium"
          @click="$emit('create-flow')"
        >
          <Plus :size="16" />
          <span>New Flow</span>
        </Button>
        <Button 
          variant="transparent"
          class="!px-2.5 !h-auto text-neutral-300 hover:text-white hover:bg-neutral-700" 
          @click="handleSearchClick" 
          title="Search flows"
        >
          <Search :size="16" />
        </Button>
      </div>
      
      <!-- Search mode -->
      <div v-else class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute -translate-y-1/2 left-3 top-1/2 text-neutral-400" :size="14" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="w-full py-2 pr-3 text-sm transition-all duration-200 border rounded-lg outline-none pl-9 bg-neutral-800 text-neutral-100 focus:border-primary-400/50 focus:bg-neutral-900"
            placeholder="Search flows..."
            @keyup.escape="isSearchMode = false; searchQuery = ''"
          />
        </div>
        <Button 
          variant="transparent" 
          class="!p-2 !h-auto text-neutral-300 hover:text-white hover:bg-neutral-700"
          @click="isSearchMode = false; searchQuery = ''"
        >
          <X :size="16" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { ArrowRightFromLine, ArrowRight, Search, Workflow, Plus, X } from 'lucide-vue-next'
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
  @apply w-1.5;
}

.scrollbar-thin::-webkit-scrollbar-track {
  @apply bg-transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  @apply bg-neutral-600 rounded;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-500;
}
</style> 