<template>
  <div class="space-y-6">
    <!-- Excluded Documents -->
    <div>
      <button
        type="button"
        @click="documentsExpanded = !documentsExpanded"
        class="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-4 hover:text-neutral-300 transition-colors"
      >
        <ChevronDown 
          class="w-4 h-4 transition-transform" 
          :class="{ 'rotate-0': documentsExpanded, '-rotate-90': !documentsExpanded }"
        />
        EXCLUDED DOCUMENTS
      </button>
      
      <div v-if="documentsExpanded" class="space-y-2">
        <!-- Empty state -->
        <div v-if="excludedDocuments.length === 0" class="text-sm text-neutral-500 italic">
          No documents excluded. Use the search below to add documents.
        </div>
        
        <!-- Existing excluded documents -->
        <div
          v-for="doc in excludedDocuments"
          :key="doc.id"
          class="flex items-center justify-between px-3 py-2 bg-neutral-800/30 border border-neutral-700/50 rounded-md group hover:bg-neutral-800/50"
        >
          <div class="flex items-center gap-2">
            <FileText class="w-4 h-4 text-neutral-500" />
            <span class="text-sm text-neutral-200">{{ doc.name }}</span>
            <span class="text-xs text-neutral-500">{{ doc.shortCode }}</span>
          </div>
          <button
            type="button"
            @click="removeDocument(doc.id)"
            class="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        
        <!-- Add document input with autocomplete -->
        <div class="relative">
          <div class="relative">
            <FileText class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
            <input
              v-model="documentSearchQuery"
              @input="searchDocuments"
              @focus="showDocumentSuggestions = true"
              @blur="hideDocumentSuggestions"
              type="text"
              placeholder="Search documents to exclude..."
              class="w-full pl-10 pr-3 py-2 bg-neutral-800/50 border border-dashed border-neutral-600 rounded-md text-neutral-100 text-sm focus:outline-none focus:border-solid focus:border-neutral-500 placeholder-neutral-400 hover:border-solid hover:border-neutral-500"
            />
            <Plus v-if="!documentSearchQuery" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
          </div>
          
          <!-- Autocomplete dropdown -->
          <div
            v-if="showDocumentSuggestions && filteredDocumentSuggestions.length > 0"
            class="absolute top-full left-0 right-0 mt-1 bg-neutral-850 border border-neutral-700 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto"
          >
            <div
              v-for="doc in filteredDocumentSuggestions"
              :key="doc.id"
              @mousedown="selectDocument(doc)"
              class="px-3 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-2 text-sm"
            >
              <FileText class="w-4 h-4 text-neutral-500" />
              <span class="text-neutral-200">{{ doc.name }}</span>
              <span class="text-xs text-neutral-500 ml-auto">{{ doc.shortCode }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Folder Exclusion Section -->
    <div class="pt-6 border-t border-neutral-800">
      <div class="flex items-center justify-between mb-4">
        <button
          type="button"
          @click="() => { if (!localData.excludeAllSubfolders) foldersExpanded = !foldersExpanded }"
          class="flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-neutral-300 transition-colors"
          :class="{ 'cursor-not-allowed opacity-50': localData.excludeAllSubfolders }"
        >
          <ChevronDown 
            class="w-4 h-4 transition-transform" 
            :class="{ 'rotate-0': foldersExpanded && !localData.excludeAllSubfolders, '-rotate-90': !foldersExpanded || localData.excludeAllSubfolders }"
          />
          FOLDER EXCLUSION
        </button>
        <div class="flex items-center gap-3">
          <label class="text-xs text-neutral-500">
            Exclude all subfolders
          </label>
          <ToggleSwitch
            v-model="localData.excludeAllSubfolders"
            @update:modelValue="updateValue"
          />
        </div>
      </div>
      
      <div v-if="foldersExpanded && !localData.excludeAllSubfolders" class="space-y-2">
        
        <!-- Existing excluded folders -->
        <div
          v-for="folder in excludedFolders"
          :key="folder.id"
          class="flex items-center justify-between px-3 py-2 bg-neutral-800/30 border border-neutral-700/50 rounded-md group hover:bg-neutral-800/50"
        >
          <div class="flex items-center gap-2">
            <Folder class="w-4 h-4 text-neutral-500" />
            <span class="text-sm text-neutral-200">{{ folder.name }}</span>
            <span class="text-xs text-neutral-500">{{ folder.path }}</span>
          </div>
          <button
            type="button"
            @click="removeFolder(folder.id)"
            class="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        
        <!-- Add folder input with autocomplete -->
        <div class="relative">
          <div class="relative">
            <Folder class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
            <input
              v-model="folderSearchQuery"
              @input="searchFolders"
              @focus="showFolderSuggestions = true"
              @blur="hideFolderSuggestions"
              type="text"
              placeholder="Search for specific folders to exclude..."
              class="w-full pl-10 pr-3 py-2 bg-neutral-800/50 border border-dashed border-neutral-600 rounded-md text-neutral-100 text-sm focus:outline-none focus:border-solid focus:border-neutral-500 placeholder-neutral-400 hover:border-solid hover:border-neutral-500"
            />
            <Plus v-if="!folderSearchQuery" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
          </div>
          
          <!-- Autocomplete dropdown -->
          <div
            v-if="showFolderSuggestions && filteredFolderSuggestions.length > 0"
            class="absolute top-full left-0 right-0 mt-1 bg-neutral-850 border border-neutral-700 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto"
          >
            <div
              v-for="folder in filteredFolderSuggestions"
              :key="folder.id"
              @mousedown="selectFolder(folder)"
              class="px-3 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-2 text-sm"
            >
              <Folder class="w-4 h-4 text-neutral-500" />
              <span class="text-neutral-200">{{ folder.name }}</span>
              <span class="text-xs text-neutral-500">{{ folder.path }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Folder, FileText, X, Plus, ChevronDown, ChevronRight } from 'lucide-vue-next'
import ToggleSwitch from './form/ToggleSwitch.vue'
import type { SearchIndexFormData } from '../../types/search-index'
import type { EARS } from '@app/api'

const props = defineProps<{
  modelValue: SearchIndexFormData
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SearchIndexFormData]
}>()

const localData = ref<SearchIndexFormData>({ ...props.modelValue })

// Collapsible state
const foldersExpanded = ref(true)
const documentsExpanded = ref(true)

// Autocomplete state
const folderSearchQuery = ref('')
const documentSearchQuery = ref('')
const showFolderSuggestions = ref(false)
const showDocumentSuggestions = ref(false)

// Mock data for all available folders and documents (in real app, would fetch from API)
const allFolders = ref<{ id: EARS.EntityId; name: string; path: string }[]>([
  { id: 'Collection-folder-1' as EARS.EntityId, name: 'Research', path: '/Library/Research' },
  { id: 'Collection-folder-2' as EARS.EntityId, name: 'Projects', path: '/Library/Projects' },
  { id: 'Collection-folder-3' as EARS.EntityId, name: 'Archive', path: '/Library/Archive' },
  { id: 'Collection-folder-4' as EARS.EntityId, name: 'Templates', path: '/Library/Templates' },
  { id: 'Collection-folder-5' as EARS.EntityId, name: 'Documentation', path: '/Library/Documentation' },
  { id: 'Collection-folder-6' as EARS.EntityId, name: 'Resources', path: '/Library/Resources' },
  { id: 'Collection-folder-7' as EARS.EntityId, name: 'Examples', path: '/Library/Examples' },
])

const allDocuments = ref<{ id: EARS.EntityId; name: string; shortCode: string }[]>([
  { id: 'Document-doc-1' as EARS.EntityId, name: 'API Documentation', shortCode: 'DOC-1001' },
  { id: 'Document-doc-2' as EARS.EntityId, name: 'User Guide', shortCode: 'DOC-1002' },
  { id: 'Document-doc-3' as EARS.EntityId, name: 'Technical Specs', shortCode: 'DOC-1003' },
  { id: 'Document-doc-4' as EARS.EntityId, name: 'Release Notes v2.0', shortCode: 'DOC-1004' },
  { id: 'Document-doc-5' as EARS.EntityId, name: 'Architecture Overview', shortCode: 'DOC-1005' },
  { id: 'Document-doc-6' as EARS.EntityId, name: 'Security Guidelines', shortCode: 'DOC-1006' },
  { id: 'Document-doc-7' as EARS.EntityId, name: 'Performance Report', shortCode: 'DOC-1007' },
  { id: 'Document-doc-8' as EARS.EntityId, name: 'Test Results', shortCode: 'DOC-1008' },
])

// Filtered suggestions based on search query and not already excluded
const filteredFolderSuggestions = computed(() => {
  if (!folderSearchQuery.value) return []
  
  const query = folderSearchQuery.value.toLowerCase()
  return allFolders.value.filter(folder => 
    !localData.value.excludedFolderIds.includes(folder.id) &&
    (folder.name.toLowerCase().includes(query) || folder.path.toLowerCase().includes(query))
  )
})

const filteredDocumentSuggestions = computed(() => {
  if (!documentSearchQuery.value) return []
  
  const query = documentSearchQuery.value.toLowerCase()
  return allDocuments.value.filter(doc => 
    !localData.value.excludedDocumentIds.includes(doc.id) &&
    (doc.name.toLowerCase().includes(query) || doc.shortCode.toLowerCase().includes(query))
  )
})

// Mock data for excluded items display
const excludedFolders = computed(() => {
  return localData.value.excludedFolderIds.map(id => {
    const folder = allFolders.value.find(f => f.id === id)
    return folder || { id, name: `Folder ${id.slice(-4)}`, path: '/unknown' }
  })
})

const excludedDocuments = computed(() => {
  return localData.value.excludedDocumentIds.map(id => {
    const doc = allDocuments.value.find(d => d.id === id)
    return doc || { id, name: `Document ${id.slice(-4)}`, shortCode: `DOC-0000` }
  })
})

watch(() => props.modelValue, (newValue) => {
  localData.value = { ...newValue }
}, { deep: true })

function updateValue() {
  emit('update:modelValue', { ...localData.value })
}

function searchFolders() {
  // This would trigger API search in real app
  showFolderSuggestions.value = true
}

function searchDocuments() {
  // This would trigger API search in real app
  showDocumentSuggestions.value = true
}

function selectFolder(folder: { id: EARS.EntityId; name: string; path: string }) {
  if (!localData.value.excludedFolderIds.includes(folder.id)) {
    localData.value.excludedFolderIds.push(folder.id)
    updateValue()
  }
  folderSearchQuery.value = ''
  showFolderSuggestions.value = false
}

function selectDocument(doc: { id: EARS.EntityId; name: string; shortCode: string }) {
  if (!localData.value.excludedDocumentIds.includes(doc.id)) {
    localData.value.excludedDocumentIds.push(doc.id)
    updateValue()
  }
  documentSearchQuery.value = ''
  showDocumentSuggestions.value = false
}

function hideFolderSuggestions() {
  // Delay to allow click on suggestion
  setTimeout(() => {
    showFolderSuggestions.value = false
  }, 200)
}

function hideDocumentSuggestions() {
  // Delay to allow click on suggestion
  setTimeout(() => {
    showDocumentSuggestions.value = false
  }, 200)
}

function removeFolder(id: EARS.EntityId) {
  localData.value.excludedFolderIds = localData.value.excludedFolderIds.filter(
    folderId => folderId !== id
  )
  updateValue()
}

function removeDocument(id: EARS.EntityId) {
  localData.value.excludedDocumentIds = localData.value.excludedDocumentIds.filter(
    docId => docId !== id
  )
  updateValue()
}
</script>