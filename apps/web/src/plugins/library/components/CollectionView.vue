<template>
  <div class="flex flex-col h-full p-6">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-semibold">Collections</h2>
      <button
        @click="showCreateForm = true"
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        New Collection
      </button>
    </div>
    
    <div v-if="showCreateForm" class="mb-6 p-4 border rounded">
      <h3 class="font-medium mb-3">Create Collection</h3>
      <form @submit.prevent="handleCreateCollection" class="flex flex-col gap-3">
        <input
          v-model="newCollection.name"
          type="text"
          placeholder="Collection name"
          required
          class="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          v-model="newCollection.description"
          type="text"
          placeholder="Description (optional)"
          class="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          v-model="newCollection.parentId"
          class="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No parent (root collection)</option>
          <option
            v-for="collection in flatCollections"
            :key="collection.id"
            :value="collection.id"
          >
            {{ collection.path.join(' / ') }}
          </option>
        </select>
        <div class="flex gap-2">
          <button
            type="submit"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Create
          </button>
          <button
            type="button"
            @click="cancelCreate"
            class="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
    
    <div class="flex-1 overflow-y-auto">
      <div v-if="collections.length === 0" class="text-center text-gray-500 mt-8">
        No collections yet. Create your first collection!
      </div>
      
      <div v-else class="space-y-2">
        <CollectionTreeItem
          v-for="collection in collections"
          :key="collection.id"
          :collection="collection"
          :level="0"
          @select="handleSelectCollection"
          @update="handleUpdateCollection"
          @delete="handleDeleteCollection"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import type { CollectionDTO } from '@abuddy/api'
import CollectionTreeItem from './CollectionTreeItem.vue'

const props = defineProps<{
  collections: CollectionDTO[]
}>()

const emit = defineEmits<{
  CREATE_COLLECTION: [{ name: string; description?: string; parentId?: string }]
  UPDATE_COLLECTION: [{ id: string; name: string; description?: string }]
  DELETE_COLLECTION: [{ id: string }]
  SELECT_COLLECTION: [{ collectionId: string }]
  TRAIL_CLICK: [{ trail: string[] }]
}>()

const showCreateForm = ref(false)
const newCollection = reactive({
  name: '',
  description: '',
  parentId: undefined as string | undefined,
})

const flatCollections = computed(() => {
  const flat: CollectionDTO[] = []
  
  function flatten(collections: CollectionDTO[]) {
    for (const col of collections) {
      flat.push(col)
      if (col.childCollections.length > 0) {
        flatten(col.childCollections)
      }
    }
  }
  
  flatten(props.collections)
  return flat
})

function handleCreateCollection() {
  emit('CREATE_COLLECTION', {
    name: newCollection.name,
    description: newCollection.description || undefined,
    parentId: newCollection.parentId || undefined,
  })
  cancelCreate()
}

function cancelCreate() {
  showCreateForm.value = false
  newCollection.name = ''
  newCollection.description = ''
  newCollection.parentId = undefined
}

function handleSelectCollection(collectionId: string) {
  emit('SELECT_COLLECTION', { collectionId })
  emit('TRAIL_CLICK', { trail: ['Documents'] })
}

function handleUpdateCollection(id: string, name: string, description?: string) {
  emit('UPDATE_COLLECTION', { id, name, description })
}

function handleDeleteCollection(id: string) {
  if (confirm('Are you sure you want to delete this collection? Documents in this collection will not be deleted.')) {
    emit('DELETE_COLLECTION', { id })
  }
}
</script>