<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-col gap-4 p-4 border-b">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">Documents</h2>
        <button
          @click="emit('CREATE_DOCUMENT')"
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          New Document
        </button>
      </div>
      
      <div class="flex gap-2">
        <input
          v-model="searchQuery"
          @input="handleSearch"
          type="text"
          placeholder="Search documents..."
          class="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          @click="emit('VIEW_COLLECTIONS')"
          class="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
        >
          Manage Collections
        </button>
      </div>
      
      <div v-if="currentCollection" class="flex items-center gap-2 text-sm text-gray-600">
        <span>Collection:</span>
        <span class="font-medium">{{ currentCollection.path.join(' / ') }}</span>
        <button
          @click="emit('SELECT_COLLECTION', { collectionId: undefined })"
          class="text-blue-500 hover:underline"
        >
          Clear
        </button>
      </div>
      
      <div v-if="allTags.length > 0" class="flex flex-wrap gap-2">
        <button
          v-for="tag in allTags"
          :key="tag"
          @click="emit('FILTER_BY_TAG', { tag })"
          :class="[
            'px-2 py-1 text-sm rounded transition-colors',
            selectedTags.includes(tag)
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 hover:bg-gray-300'
          ]"
        >
          {{ tag }}
        </button>
        <button
          v-if="selectedTags.length > 0"
          @click="emit('CLEAR_FILTERS')"
          class="px-2 py-1 text-sm text-red-500 hover:underline"
        >
          Clear filters
        </button>
      </div>
    </div>
    
    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="filteredDocuments.length === 0" class="text-center text-gray-500 mt-8">
        <p v-if="documents.length === 0">No documents yet. Create your first document!</p>
        <p v-else>No documents match your filters.</p>
      </div>
      
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="doc in filteredDocuments"
          :key="doc.id"
          class="p-4 border rounded hover:shadow-md transition-shadow cursor-pointer"
          @click="emit('EDIT_DOCUMENT', { documentId: doc.id })"
        >
          <h3 class="font-semibold mb-2">{{ doc.name }}</h3>
          <p class="text-sm text-gray-600 mb-2 line-clamp-3">{{ doc.content }}</p>
          <div class="flex flex-wrap gap-1 mb-2">
            <span
              v-for="tag in doc.tags"
              :key="tag"
              class="px-2 py-1 text-xs bg-gray-200 rounded"
            >
              {{ tag }}
            </span>
          </div>
          <div class="flex justify-between items-center text-xs text-gray-500">
            <span>{{ formatDate(doc.updatedAt) }}</span>
            <button
              @click.stop="handleDelete(doc.id)"
              class="text-red-500 hover:underline"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentDTO, CollectionDTO } from '@abuddy/api'

const props = defineProps<{
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  searchQuery: string
  selectedTags: string[]
  selectedCollectionId?: string
}>()

const emit = defineEmits<{
  CREATE_DOCUMENT: []
  EDIT_DOCUMENT: [{ documentId: string }]
  DELETE_DOCUMENT: [{ documentId: string }]
  VIEW_COLLECTIONS: []
  SEARCH_DOCUMENTS: [{ query: string }]
  FILTER_BY_TAG: [{ tag: string }]
  CLEAR_FILTERS: []
  SELECT_COLLECTION: [{ collectionId?: string }]
}>()

const searchQuery = ref(props.searchQuery)

const allTags = computed(() => {
  const tags = new Set<string>()
  props.documents.forEach(doc => {
    doc.tags.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

const currentCollection = computed(() => {
  if (!props.selectedCollectionId) return null
  return findCollection(props.collections, props.selectedCollectionId)
})

const filteredDocuments = computed(() => {
  let docs = props.documents

  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase()
    docs = docs.filter(doc =>
      doc.name.toLowerCase().includes(query) ||
      doc.content.toLowerCase().includes(query)
    )
  }

  if (props.selectedTags.length > 0) {
    docs = docs.filter(doc =>
      props.selectedTags.every(tag => doc.tags.includes(tag))
    )
  }

  if (props.selectedCollectionId) {
    docs = docs.filter(doc => doc.collectionId === props.selectedCollectionId)
  }

  return docs.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
})

function findCollection(collections: CollectionDTO[], id: string): CollectionDTO | null {
  for (const col of collections) {
    if (col.id === id) return col
    const found = findCollection(col.childCollections, id)
    if (found) return found
  }
  return null
}

function handleSearch() {
  emit('SEARCH_DOCUMENTS', { query: searchQuery.value })
}

function handleDelete(documentId: string) {
  if (confirm('Are you sure you want to delete this document?')) {
    emit('DELETE_DOCUMENT', { documentId })
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>