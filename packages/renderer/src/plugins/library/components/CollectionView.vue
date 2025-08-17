<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <p class="text-sm text-neutral-400">Organize documents into collections</p>
      </div>
      <Button @click="showCreateForm = true" variant="primary">
        <Plus class="w-4 h-4" />
        <span>New Collection</span>
      </Button>
    </div>
    
    <!-- Create Form -->
    <div v-if="showCreateForm" class="px-6 py-4 border-b border-neutral-800">
      <h3 class="mb-4 text-sm font-medium text-neutral-100">Create Collection</h3>
      <form @submit.prevent="handleCreateCollection" class="space-y-4">
        <div>
          <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
            Name <span class="text-red-400">*</span>
          </label>
          <input
            v-model="newCollection.name"
            type="text"
            placeholder="Collection name"
            required
            class="w-full px-4 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
            Description
          </label>
          <input
            v-model="newCollection.description"
            type="text"
            placeholder="Description (optional)"
            class="w-full px-4 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
            Parent Collection
          </label>
          <select
            v-model="newCollection.parentId"
            class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
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
        </div>
        <div class="flex gap-2">
          <Button
            type="submit"
            variant="primary"
          >
            Create
          </Button>
          <Button
            type="button"
            @click="cancelCreate"
            variant="transparent"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
    
    <!-- Collections List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="collections.length === 0" class="flex flex-col items-center justify-center h-full">
        <div class="flex flex-col items-center max-w-sm text-center">
          <div class="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-800">
            <Folder class="w-8 h-8 text-neutral-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-neutral-100">No collections yet</h3>
          <p class="mb-6 text-sm text-neutral-400">
            Create your first collection to organize your documents
          </p>
          <Button @click="showCreateForm = true" variant="primary">
            <Plus class="w-4 h-4" />
            <span>Create Your First Collection</span>
          </Button>
        </div>
      </div>
      
      <div v-else class="p-6">
        <div class="space-y-2">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { Plus, Folder } from 'lucide-vue-next'
import Button from '@/core/components/design/button.vue'
import type { CollectionDTO } from '@app/api'
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