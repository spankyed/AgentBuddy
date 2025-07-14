<template>
  <div class="flex flex-col h-full p-6">
    <h2 class="text-xl font-semibold mb-6">Edit Document</h2>
    
    <form @submit.prevent="handleSave" class="flex flex-col gap-4 flex-1">
      <div>
        <label for="name" class="block text-sm font-medium mb-1">Name</label>
        <input
          id="name"
          v-model="formData.name"
          type="text"
          required
          class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      <div>
        <label for="tags" class="block text-sm font-medium mb-1">Tags</label>
        <div class="flex flex-wrap gap-2 mb-2">
          <span
            v-for="(tag, index) in formData.tags"
            :key="index"
            class="px-2 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-1"
          >
            {{ tag }}
            <button
              type="button"
              @click="removeTag(index)"
              class="text-blue-700 hover:text-blue-900"
            >
              ×
            </button>
          </span>
        </div>
        <input
          id="tags"
          v-model="newTag"
          @keydown.enter.prevent="addTag"
          type="text"
          placeholder="Add tag and press Enter"
          class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      <div>
        <label for="collection" class="block text-sm font-medium mb-1">Collection</label>
        <select
          id="collection"
          v-model="formData.collectionId"
          class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No collection</option>
          <option
            v-for="collection in flatCollections"
            :key="collection.id"
            :value="collection.id"
          >
            {{ collection.path.join(' / ') }}
          </option>
        </select>
      </div>
      
      <div class="flex-1">
        <label for="content" class="block text-sm font-medium mb-1">Content</label>
        <textarea
          id="content"
          v-model="formData.content"
          required
          class="w-full h-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      
      <div class="flex gap-2">
        <button
          type="submit"
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          @click="emit('CANCEL_EDIT')"
          class="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import type { DocumentDTO, CollectionDTO } from '@abuddy/api'

const props = defineProps<{
  document: DocumentDTO
  collections: CollectionDTO[]
}>()

const emit = defineEmits<{
  SAVE_DOCUMENT: [{ name: string; content: string; tags: string[]; collectionId?: string }]
  CANCEL_EDIT: []
}>()

const formData = reactive({
  name: '',
  content: '',
  tags: [] as string[],
  collectionId: undefined as string | undefined,
})

const newTag = ref('')

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

onMounted(() => {
  formData.name = props.document.name
  formData.content = props.document.content
  formData.tags = [...props.document.tags]
  formData.collectionId = props.document.collectionId
})

function addTag() {
  const tag = newTag.value.trim()
  if (tag && !formData.tags.includes(tag)) {
    formData.tags.push(tag)
    newTag.value = ''
  }
}

function removeTag(index: number) {
  formData.tags.splice(index, 1)
}

function handleSave() {
  emit('SAVE_DOCUMENT', {
    name: formData.name,
    content: formData.content,
    tags: formData.tags,
    collectionId: formData.collectionId,
  })
}
</script>