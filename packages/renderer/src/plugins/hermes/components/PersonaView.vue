<template>
  <div class="p-8">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-medium text-neutral-100">Persona</h2>
        <p class="text-xs text-neutral-500 mt-0.5">Edit SOUL.md — the agent's personality and instructions</p>
      </div>
      <button
        @click="handleSave"
        :disabled="!isDirty"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
      >
        <Save class="w-3 h-3" />
        Save
      </button>
    </div>

    <div v-if="personaPath" class="mb-3 text-xs text-neutral-500 font-mono">
      {{ personaPath }}
    </div>

    <textarea
      v-model="editedContent"
      rows="24"
      class="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-200 font-mono placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-y"
      placeholder="# Agent Persona\n\nDescribe your agent's personality, instructions, and behavior here..."
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Save } from 'lucide-vue-next'

const props = defineProps<{
  persona: string
  personaPath: string
}>()

const emit = defineEmits<{
  updatePersona: [content: string]
}>()

const editedContent = ref(props.persona)

watch(() => props.persona, (val) => {
  editedContent.value = val
})

const isDirty = computed(() => editedContent.value !== props.persona)

function handleSave() {
  emit('updatePersona', editedContent.value)
}
</script>
