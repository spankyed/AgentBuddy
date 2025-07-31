<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <p class="text-sm text-neutral-400">Manage your documents and collections</p>
      </div>
      <Button @click="emit('CREATE_DOCUMENT')" variant="primary">
        <Plus class="w-4 h-4" />
        <span>New Document</span>
      </Button>
    </div>
    
    <!-- Search and Filters -->
    <div class="px-6 py-4 border-b border-neutral-800">
      <div class="flex gap-3 mb-4">
        <input
          v-model="searchQuery"
          @input="handleSearch"
          type="text"
          placeholder="Search documents..."
          class="flex-1 px-4 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        />
        <Button
          @click="emit('VIEW_COLLECTIONS')"
          variant="transparent"
        >
          <Folder class="w-4 h-4" />
          <span>Collections</span>
        </Button>
      </div>
      
      <div v-if="currentCollection" class="flex items-center gap-2 text-sm text-neutral-400 mb-3">
        <Folder class="w-4 h-4" />
        <span>Collection:</span>
        <span class="font-medium text-neutral-300">{{ currentCollection.path.join(' / ') }}</span>
        <button
          @click="emit('SELECT_COLLECTION', { collectionId: undefined })"
          class="ml-2 text-blue-400 hover:text-blue-300 transition-colors"
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
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            selectedTags.includes(tag)
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
          ]"
        >
          {{ tag }}
        </button>
        <button
          v-if="selectedTags.length > 0"
          @click="emit('CLEAR_FILTERS')"
          class="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear filters
        </button>
      </div>
    </div>
    
    <!-- Documents Table -->
    <div class="flex-1 overflow-hidden">
      <div v-if="filteredDocuments.length > 0" class="h-full overflow-y-auto custom-scrollbar">
        <table class="w-full">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium tracking-wider text-left uppercase border-b text-neutral-400 border-neutral-800">
              <th class="px-6 py-3">Name</th>
              <th class="px-6 py-3">Content Preview</th>
              <th class="px-6 py-3">Tags</th>
              <th class="px-6 py-3">Updated</th>
              <th class="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800">
            <tr
              v-for="doc in filteredDocuments"
              :key="doc.id"
              class="transition-all duration-200 cursor-pointer group hover:bg-neutral-800"
              @click="emit('EDIT_DOCUMENT', { documentId: doc.id })"
            >
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex items-center justify-center w-8 h-8 transition-colors rounded-lg bg-neutral-800 group-hover:bg-neutral-700">
                    <FileText class="w-4 h-4 text-neutral-400" />
                  </div>
                  <span class="font-medium text-neutral-100">{{ doc.name }}</span>
                </div>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-neutral-400 line-clamp-1" :title="doc.content">
                  {{ doc.content || 'No content' }}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in doc.tags.slice(0, 3)"
                    :key="tag"
                    class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-if="doc.tags.length > 3"
                    class="inline-flex items-center px-2 py-0.5 text-xs text-neutral-500"
                    :title="doc.tags.slice(3).join(', ')"
                  >
                    +{{ doc.tags.length - 3 }}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-neutral-300">
                  {{ formatDate(doc.updatedAt) }}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click.stop="handleDelete(doc.id)"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-red-400 hover:bg-red-400/10 active:scale-95"
                    aria-label="Delete document"
                    title="Delete document"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center justify-center h-full"
      >
        <div class="flex flex-col items-center max-w-sm text-center">
          <div class="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-800">
            <FileText class="w-8 h-8 text-neutral-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-neutral-100">
            {{ documents.length === 0 ? 'No documents yet' : 'No documents match your filters' }}
          </h3>
          <p class="mb-6 text-sm text-neutral-400">
            {{ documents.length === 0 ? 'Create your first document to get started' : 'Try adjusting your search or filters' }}
          </p>
          <Button v-if="documents.length === 0" @click="emit('CREATE_DOCUMENT')" variant="primary">
            <Plus class="w-4 h-4" />
            <span>Create Your First Document</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, FileText, Folder, Trash2 } from 'lucide-vue-next'
import Button from '@/core/design/button.vue'
import type { DocumentDTO, CollectionDTO } from '@app/api'

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