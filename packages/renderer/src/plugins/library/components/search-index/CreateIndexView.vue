<template>
  <div class="flex flex-col h-full bg-neutral-900 relative">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-neutral-800">
      <div>
        <h2 class="text-lg font-semibold text-neutral-100">Create Search Index</h2>
        <p class="text-sm text-neutral-500">Configure text embedding and vector search for documents</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="emit('CANCEL_CREATE_INDEX')"
          variant="transparent"
        >
          Cancel
        </Button>
        <Button
          @click="handleSave"
          :disabled="!isValid"
          variant="primary"
        >
          Create Index
        </Button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex justify-center border-b border-neutral-800">
      <div class="flex gap-2 p-2">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          @click="activeTab = tab.id"
          class="px-6 py-2 text-sm font-medium rounded-md transition-colors"
          :class="[
            activeTab === tab.id
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Form Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-3xl p-8 mx-auto">
        <form @submit.prevent="handleSave">
          <!-- Details Tab -->
          <div v-if="activeTab === 'details'">
            <DetailsSection 
              :modelValue="formData" 
              @update:modelValue="Object.assign(formData, $event)"
            />
          </div>

          <!-- Scope Tab -->
          <div v-if="activeTab === 'scope'">
            <ScopeSection 
              :modelValue="formData"
              @update:modelValue="Object.assign(formData, $event)"
            />
          </div>

          <!-- Sections Tab -->
          <div v-if="activeTab === 'sections'">
            <SectionsConfig 
              :modelValue="formData"
              @update:modelValue="Object.assign(formData, $event)"
            />
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import Button from '@/core/design/button.vue'
import DetailsSection from './DetailsSection.vue'
import ScopeSection from './ScopeSection.vue'
import SectionsConfig from './SectionsConfig.vue'
import type { SearchIndexFormData } from '../../types/search-index'

const emit = defineEmits<{
  SAVE_SEARCH_INDEX: [config: SearchIndexFormData]
  CANCEL_CREATE_INDEX: []
}>()

const tabs = [
  { id: 'details', label: 'Details' },
  { id: 'scope', label: 'Scope' },
  { id: 'sections', label: 'Sections' }
] as const

const activeTab = ref<'details' | 'scope' | 'sections'>('details')

const formData = reactive<SearchIndexFormData>({
  // Details
  name: '',
  description: '',
  embeddingModel: 'all-MiniLM-L6-v2',
  indexMetric: 'cosine',
  connectors: 16,
  
  // Scope
  excludeAllSubfolders: false,
  excludedFolderIds: [],
  excludedDocumentIds: [],
  
  // Sections
  enableSectionIndexing: false,
  segmentRules: [],
  constructTemplate: '{{segment 1}}'
})

const isValid = computed(() => {
  return formData.name.trim().length > 0
})

function handleSave() {
  if (isValid.value) {
    emit('SAVE_SEARCH_INDEX', formData)
  }
}
</script>