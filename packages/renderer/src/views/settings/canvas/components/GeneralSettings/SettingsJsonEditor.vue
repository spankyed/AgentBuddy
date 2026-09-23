<template>
  <div class="max-w-3xl">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-semibold text-white">Settings JSON</h2>
        <span v-if="problems.length" class="text-xs text-red-400">{{ problems.join('; ') }}</span>
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
          :disabled="!canSave"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            !canSave
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
import { usePlugin } from '@abuddy/sdk/fe'
import { settingsProblems } from '@abuddy/host/settings'
import { ref, computed, onMounted, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor'

const actor = usePlugin()
const settings = useSelector(actor, (state: any) => state.context.settings)
const replacement = useSelector(actor, (state: any) => state.context.replacement)

const jsonText = ref('')
const originalText = ref('')
const problems = ref<string[]>([])
const isDirty = ref(false)
const saved = ref(false)
let savedTimeout: ReturnType<typeof setTimeout> | null = null

const canSave = computed(() => isDirty.value && problems.value.length === 0 && replacement.value.status !== 'saving')

function loadSettings() {
  const text = JSON.stringify(settings.value, null, 2)
  jsonText.value = text
  originalText.value = text
  isDirty.value = false
  problems.value = []
}

onMounted(loadSettings)

watch(settings, () => {
  if (!isDirty.value) loadSettings()
})

/**
 * Why the text can't be saved: it isn't JSON, or the store's own check refuses it. Which features are installed only
 * the store knows, so it can still refuse a changed plugin's settings, and says why
 */
function problemsIn(text: string): string[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    return [(e as Error).message]
  }
    // The sections a pack registered are whatever the stored document holds beside the plugins' slices
  const sections = Object.keys((settings.value ?? {}) as Record<string, unknown>).filter((name) => name !== 'plugins')
  return settingsProblems(data, { before: settings.value, sections })
}

function onEditorChange(value: string) {
  jsonText.value = value
  isDirty.value = value !== originalText.value
  problems.value = problemsIn(value)
}

function onReset() {
  loadSettings()
}

function onSave() {
  if (!canSave.value) return
  actor.send({ type: 'SETTINGS.REPLACE', data: JSON.parse(jsonText.value) })
}

// The store's answer to a save: stored, the text becomes the settings shown; refused, the text stays with the reasons
watch(replacement, (answer) => {
  if (answer.status === 'saved') {
    loadSettings()
    saved.value = true
    if (savedTimeout) clearTimeout(savedTimeout)
    savedTimeout = setTimeout(() => { saved.value = false }, 2000)
  } else if (answer.status === 'refused') {
    problems.value = answer.problems
  }
})
</script>
