<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">Create Document</h2>
        <p class="text-xs text-neutral-400">Create a new document with content and tags</p>
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
          Create Document
        </Button>
      </div>
    </div>

    <!-- Form Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl p-6 mx-auto">
        <form @submit.prevent="handleSave" class="space-y-6">
          <!-- Basic Info Section -->
          <div class="space-y-4">
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
          </div>
          
          <!-- Tags Section -->
          <div class="pt-6 border-t border-neutral-800">
            <button
              type="button"
              @click="tagsExpanded = !tagsExpanded"
              class="flex items-center gap-2 mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400 hover:text-neutral-300 transition-colors"
            >
              <ChevronDown v-if="tagsExpanded" class="w-4 h-4" />
              <ChevronRight v-else class="w-4 h-4" />
              Tags
              <span v-if="formData.tags.length > 0 && !tagsExpanded" class="ml-2 text-neutral-500">
                ({{ formData.tags.length }})
              </span>
            </button>
            <div v-if="tagsExpanded" class="space-y-3">
              <div class="flex flex-wrap gap-2">
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
          </div>
          
          <!-- Content Sections -->
          <div class="pt-6 border-t border-neutral-800">
            <div class="flex items-center justify-between mb-4">
              <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">
                Content <span class="text-red-400">*</span>
              </label>
              <button
                type="button"
                @click="addContentSection"
                class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
              >
                <Plus class="w-4 h-4" />
                Add Section
              </button>
            </div>
            <div class="space-y-4">
              <ContentSectionEditor
                v-for="(section, index) in formData.content"
                :key="index"
                :ref="el => setSectionRef(el, index)"
                :section="section"
                :show-remove="formData.content.length > 1"
                @update="updateContentSection(index, $event)"
                @remove="removeContentSection(index)"
                @type-changed="handleTypeChanged(index)"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, nextTick } from 'vue'
import { X, ChevronDown, ChevronRight, Plus } from 'lucide-vue-next'
import Button from '@/core/design/button.vue'
import ContentSectionEditor from './content-sections/ContentSectionEditor.vue'
import type { CollectionDTO, ContentSection } from '@app/api'

const props = defineProps<{
  collections: CollectionDTO[]
  selectedCollectionId?: string
}>()

const emit = defineEmits<{
  SAVE_DOCUMENT: [{ name: string; content: ContentSection[]; tags: string[]; collectionId?: string }]
  CANCEL_EDIT: []
}>()

const formData = reactive({
  name: '',
  content: [{ type: 'text', text: '' }] as ContentSection[],
  tags: [] as string[],
  collectionId: props.selectedCollectionId,
})

// Watch for changes to selectedCollectionId prop
watch(() => props.selectedCollectionId, (newValue) => {
  formData.collectionId = newValue
})

const newTag = ref('')
const tagsExpanded = ref(false)
const sectionRefs = ref<(InstanceType<typeof ContentSectionEditor> | null)[]>([])

const isValid = computed(() => {
  return formData.name.trim() !== '' && formData.content.length > 0
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

function addContentSection() {
  formData.content.push({ type: 'text', text: '' } as ContentSection)
}

function updateContentSection(index: number, section: ContentSection) {
  formData.content[index] = section
}

function removeContentSection(index: number) {
  formData.content.splice(index, 1)
}

function handleSave() {
  emit('SAVE_DOCUMENT', {
    name: formData.name,
    content: formData.content,
    tags: formData.tags,
    collectionId: formData.collectionId,
  })
}

function setSectionRef(el: any, index: number) {
  if (el) {
    sectionRefs.value[index] = el
  }
}

async function handleTypeChanged(index: number) {
  await nextTick()
  sectionRefs.value[index]?.scrollIntoView()
}
</script>