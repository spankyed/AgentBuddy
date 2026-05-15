<template>
  <div class="p-8">
    <h2 class="text-lg font-medium text-neutral-100 mb-4">Memory</h2>

    <!-- Tab Bar -->
    <div class="flex gap-1 mb-4 border-b border-neutral-800">
      <button
        v-for="file in memoryFiles"
        :key="file"
        @click="activeFile = file"
        :class="[
          'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
          activeFile === file
            ? 'text-primary-400 border-primary-400'
            : 'text-neutral-500 border-transparent hover:text-neutral-300'
        ]"
      >
        {{ file }}
      </button>
    </div>

    <!-- Editor -->
    <div class="relative">
      <textarea
        v-model="editedContent"
        rows="20"
        class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-200 font-mono placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-y"
        :placeholder="`Contents of ${activeFile}...`"
      />

      <div v-if="isDirty" class="absolute bottom-3 right-3">
        <button
          @click="handleSave"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          <Save class="w-3 h-3" />
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Save } from 'lucide-vue-next'

const props = defineProps<{
  memory: Record<string, string>
}>()

const emit = defineEmits<{
  writeMemory: [event: { filename: string; content: string }]
}>()

const memoryFiles = ['MEMORY.md', 'USER.md', 'SOUL.md'] as const
const activeFile = ref<string>('MEMORY.md')
const editedContent = ref('')

watch([() => props.memory, activeFile], () => {
  editedContent.value = props.memory[activeFile.value] ?? ''
}, { immediate: true })

const isDirty = computed(() => {
  return editedContent.value !== (props.memory[activeFile.value] ?? '')
})

function handleSave() {
  emit('writeMemory', {
    filename: activeFile.value,
    content: editedContent.value,
  })
}
</script>
