<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">Edit Document</h2>
        <p class="text-xs text-neutral-400">Modify document details and content</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="emit('CANCEL_EDIT')"
          variant="transparent"
        >
          Cancel
        </Button>
        <Button
          @click="handleSave"
          :disabled="!isValid"
          variant="primary"
        >
          Save Changes
        </Button>
      </div>
    </div>

    <!-- Form Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl p-6 mx-auto">
        <form @submit.prevent="handleSave" class="space-y-6">
          <!-- Basic Info Section -->
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
                  Name <span class="text-red-400">*</span>
                </label>
                <input
                  v-model="formData.name"
                  type="text"
                  class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                  placeholder="Enter document name"
                />
              </div>
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Collection</label>
                <select
                  v-model="formData.collectionId"
                  class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
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
            </div>
          </div>
          
          <!-- Tags Section -->
          <div class="pt-6 border-t border-neutral-800">
            <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Tags
            </label>
            <div class="flex flex-wrap gap-2 mb-3">
              <span
                v-for="(tag, index) in formData.tags"
                :key="index"
                class="inline-flex items-center px-2.5 py-1 text-sm font-medium rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30"
              >
                {{ tag }}
                <button
                  type="button"
                  @click="removeTag(index)"
                  class="ml-2 text-blue-300 hover:text-blue-100 transition-colors"
                >
                  <X class="w-3 h-3" />
                </button>
              </span>
            </div>
            <input
              v-model="newTag"
              @keydown.enter.prevent="addTag"
              type="text"
              placeholder="Add tag and press Enter"
              class="w-full px-4 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <!-- Content Section -->
          <div class="pt-6 border-t border-neutral-800">
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Content <span class="text-red-400">*</span>
            </label>
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 400px;">
              <textarea
                v-model="formData.content"
                placeholder="Enter document content..."
                class="w-full h-full px-4 py-3 text-sm transition-colors resize-none bg-neutral-800 text-neutral-100 focus:outline-none"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { X } from 'lucide-vue-next'
import Button from '@/core/design/button.vue'
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

const isValid = computed(() => {
  return formData.name.trim() !== '' && formData.content.trim() !== ''
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