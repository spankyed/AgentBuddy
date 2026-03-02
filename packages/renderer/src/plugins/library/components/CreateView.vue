<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center gap-4 px-6 py-3 border-b border-neutral-800">
      <label class="text-xs font-medium tracking-wider uppercase shrink-0 min-w-52 text-right text-neutral-400">
        Document Name
      </label>
      <input
        v-model="formData.name"
        type="text"
        data-onboarding-id="library-document-name-input"
        class="flex-1 min-w-0 px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        placeholder="Enter document name"
      />
      <div class="flex items-center gap-2 shrink-0">
        <Button @click="emit('CANCEL_EDIT')" variant="transparent">Cancel</Button>
        <Button @click="handleSave" :disabled="!isValid" variant="primary">Create Document</Button>
      </div>
    </div>

    <!-- Form Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl p-6 mx-auto">
        <form @submit.prevent="handleSave" class="space-y-6">
          <!-- Content Sections -->
          <div class="space-y-4" data-onboarding-id="library-content-sections">
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
          <button
            type="button"
            @click="addContentSection"
            class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
          >
            <Plus class="w-4 h-4" />
            Add Section
          </button>

          <!-- Tags Section -->
          <div class="pt-6 border-t border-neutral-800">
            <button
              type="button"
              @click="tagsExpanded = !tagsExpanded"
              class="flex items-center gap-2 mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400 hover:text-neutral-300 transition-colors"
            >
              <ChevronRight class="w-4 h-4 transition-transform" :class="{ 'rotate-90': tagsExpanded }" />
              Tags
              <span v-if="formData.tags.length > 0 && !tagsExpanded" class="ml-2 text-neutral-500">
                ({{ formData.tags.length }})
              </span>
            </button>
            <div v-if="tagsExpanded" class="space-y-3">
              <TagInput
                :modelValue="formData.tags"
                @update:modelValue="updateTags"
                :availableTags="availableTags"
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
import { X, ChevronRight, Plus } from 'lucide-vue-next'
import Button from '@/core/components/design/button.vue'
import ContentSectionEditor from './content-sections/ContentSectionEditor.vue'
import TagInput from '@/core/components/design/tag-input.vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import type { CollectionDTO, ContentSection } from '@app/api'

const props = defineProps<{
  collections: CollectionDTO[]
  selectedCollectionId?: string
}>()

const emit = defineEmits<{
  SAVE_DOCUMENT: [{ name: string; content: ContentSection[]; tags: string[]; collectionId?: string }]
  CANCEL_EDIT: []
}>()

// Get settings from state
const actor = applicationState.system.get('library')
const settings = useSelector(actor, (state: any) => state.context.settings)

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

const tagsExpanded = ref(false)
const sectionRefs = ref<(InstanceType<typeof ContentSectionEditor> | null)[]>([])

const isValid = computed(() => {
  return formData.name.trim() !== '' && formData.content.length > 0
})

const availableTags = computed(() => {
  return settings.value?.tags || []
})


function updateTags(newTags: string[]) {
  formData.tags = newTags
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
