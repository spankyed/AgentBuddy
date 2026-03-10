<template>
  <div ref="sectionRef" class="space-y-4 p-4 border rounded-md border-neutral-700 bg-neutral-800/50">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <!-- Content type selector -->
        <select
          v-if="section"
          :value="section.type"
          :disabled="hasContent"
          @change="handleTypeChange($event)"
          class="px-3 py-1.5 text-xs font-medium tracking-wider uppercase transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-400 focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-default"
        >
          <option value="markdown">Markdown</option>
          <option value="text">Plain Text</option>
          <option value="code">Code</option>
          <option value="field">Fields</option>
          <option value="list">List</option>
        </select>
        <select
          v-else
          v-model="selectedType"
          @change="initializeSection"
          class="px-3 py-1.5 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        >
          <option value="" disabled>Select content type</option>
          <option value="markdown">Markdown</option>
          <option value="text">Plain Text</option>
          <option value="code">Code</option>
          <option value="field">Field (Key-Value)</option>
          <option value="list">List</option>
        </select>
      </div>
      <div class="flex items-center gap-1">
        <button
          @click="isExpanded = !isExpanded"
          type="button"
          class="p-1 text-neutral-400 hover:text-neutral-200 transition-all"
          :class="{ 'rotate-90': isExpanded }"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
        <button
          v-if="showRemove"
          @click="$emit('remove')"
          type="button"
          class="p-1.5 text-neutral-400 hover:text-red-400 transition-colors"
          title="Remove section"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <component
      v-if="section && isExpanded"
      :is="editorComponent"
      :content="section"
      v-bind="section.type === 'code' && fileName ? { 'file-name': fileName } : {}"
      @update="handleUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { X, ChevronRight } from 'lucide-vue-next'
import type { ContentSection, ContentType, CodeContent } from '@app/api'
import FieldEditor from './FieldEditor.vue'
import ListEditor from './ListEditor.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import TextEditor from './TextEditor.vue'
import CodeEditor from './CodeEditor.vue'

const props = defineProps<{
  section?: ContentSection
  showRemove?: boolean
  fileName?: string
}>()

const emit = defineEmits<{
  update: [section: ContentSection]
  remove: []
  'type-changed': []
}>()

const selectedType = ref<ContentType | ''>('')
const sectionRef = ref<HTMLDivElement | null>(null)
const isExpanded = ref(true)

const hasContent = computed(() => {
  if (!props.section) return false

  switch (props.section.type) {
    case 'markdown':
    case 'text':
    case 'code':
      return props.section.text.trim().length > 0
    case 'field':
      return props.section.fields.some(f => f.key.trim() || f.value.trim())
    case 'list':
      return props.section.items.some(item => item.trim())
    default:
      return false
  }
})

const editorComponent = computed(() => {
  if (!props.section) return null
  switch (props.section.type) {
    case 'field': return FieldEditor as any
    case 'list': return ListEditor as any
    case 'markdown': return MarkdownEditor as any
    case 'text': return TextEditor as any
    case 'code': return CodeEditor as any
  }
})

const initializeSection = () => {
  if (!selectedType.value) return

  let newSection: ContentSection
  switch (selectedType.value) {
    case 'field':
      newSection = { type: 'field', fields: [{ key: '', value: '' }] }
      break
    case 'list':
      newSection = { type: 'list', items: [''] }
      break
    case 'markdown':
      newSection = { type: 'markdown', text: '' }
      break
    case 'text':
      newSection = { type: 'text', text: '' }
      break
    case 'code':
      newSection = { type: 'code', text: '', language: 'plaintext' }
      break
  }

  emit('update', newSection)
  selectedType.value = ''
}

const handleTypeChange = async (event: Event) => {
  const newType = (event.target as HTMLSelectElement).value as ContentType

  let newSection: ContentSection
  switch (newType) {
    case 'field':
      newSection = { type: 'field', fields: [{ key: '', value: '' }] }
      break
    case 'list':
      newSection = { type: 'list', items: [''] }
      break
    case 'markdown':
      newSection = { type: 'markdown', text: '' }
      break
    case 'text':
      newSection = { type: 'text', text: '' }
      break
    case 'code':
      newSection = { type: 'code', text: '', language: 'plaintext' }
      break
  }

  emit('update', newSection)
  await nextTick()
  emit('type-changed')
}

const handleUpdate = (data: any) => {
  if (!props.section) return

  let updatedSection: ContentSection
  switch (props.section.type) {
    case 'field':
      updatedSection = { type: 'field', fields: data }
      break
    case 'list':
      updatedSection = { type: 'list', items: data }
      break
    case 'markdown':
      updatedSection = { type: 'markdown', text: data }
      break
    case 'text':
      updatedSection = { type: 'text', text: data }
      break
    case 'code':
      updatedSection = { type: 'code', text: data, language: (props.section as CodeContent).language }
      break
  }

  emit('update', updatedSection)
}

const scrollIntoView = () => {
  sectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

defineExpose({
  scrollIntoView
})
</script>
