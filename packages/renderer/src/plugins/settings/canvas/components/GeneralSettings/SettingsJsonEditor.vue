<template>
  <div class="max-w-3xl">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-semibold text-white">Settings JSON</h2>
        <span v-if="parseError" class="text-xs text-red-400">{{ parseError }}</span>
        <span v-else-if="saved" class="text-xs text-green-500">Saved</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="onReset"
          class="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
        >
          Reset
        </button>
        <button
          @click="onSave"
          :disabled="!!parseError || !isDirty"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            parseError || !isDirty
              ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          ]"
        >
          Save
        </button>
      </div>
    </div>
    <div class="h-[calc(100vh-220px)] border border-neutral-700 rounded-lg overflow-hidden">
      <SimpleMonacoEditor
        :modelValue="jsonText"
        language="json"
        @update:modelValue="onEditorChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue'

const actor = applicationState.system.get('settings')
const settings = useSelector(actor, (state: any) => state.context.settings)

const jsonText = ref('')
const originalText = ref('')
const parseError = ref<string | null>(null)
const isDirty = ref(false)
const saved = ref(false)
let savedTimeout: ReturnType<typeof setTimeout> | null = null

function loadSettings() {
  const text = JSON.stringify(settings.value, null, 2)
  jsonText.value = text
  originalText.value = text
  isDirty.value = false
  parseError.value = null
}

onMounted(loadSettings)

watch(settings, () => {
  if (!isDirty.value) loadSettings()
})

function onEditorChange(value: string) {
  jsonText.value = value
  isDirty.value = value !== originalText.value
  try {
    JSON.parse(value)
    parseError.value = null
  } catch (e) {
    parseError.value = (e as Error).message
  }
}

function onReset() {
  loadSettings()
}

function onSave() {
  if (parseError.value || !isDirty.value) return
  try {
    const data = JSON.parse(jsonText.value)
    actor.send({ type: 'SETTINGS.REPLACE', data })
    originalText.value = jsonText.value
    isDirty.value = false
    saved.value = true
    if (savedTimeout) clearTimeout(savedTimeout)
    savedTimeout = setTimeout(() => { saved.value = false }, 2000)
  } catch (e) {
    parseError.value = (e as Error).message
  }
}
</script>
