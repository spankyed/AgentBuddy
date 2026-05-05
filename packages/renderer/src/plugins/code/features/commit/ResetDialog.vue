<template>
  <Teleport to="body">
    <div
      v-if="show"
      @click.self="onCancel"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div class="overflow-hidden border rounded-lg shadow-xl bg-neutral-900 border-neutral-700 w-96">
        <div class="p-4 border-b border-neutral-800">
          <h3 class="text-lg font-semibold text-neutral-100">Reset to Commit</h3>
        </div>

        <div class="p-4">
          <p class="mb-3 text-sm text-neutral-300">
            Reset HEAD to <code class="px-1 py-0.5 rounded bg-neutral-800 text-neutral-200">{{ shortHash }}</code>?
          </p>

          <div class="mb-4 space-y-2">
            <label
              v-for="opt in modeOptions"
              :key="opt.value"
              class="flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-neutral-800/50"
              :class="selectedMode === opt.value ? 'bg-neutral-800' : ''"
            >
              <input
                type="radio"
                :value="opt.value"
                v-model="selectedMode"
                class="mt-0.5 accent-blue-500"
              />
              <div>
                <div class="text-sm font-medium text-neutral-200">{{ opt.label }}</div>
                <div class="text-xs text-neutral-400">{{ opt.description }}</div>
              </div>
            </label>
          </div>

          <p v-if="selectedMode === 'hard'" class="text-sm text-yellow-500">
            <AlertCircle class="inline w-4 h-4 mr-1" />
            This will permanently discard all changes after this commit.
          </p>
        </div>

        <div class="flex justify-end gap-2 p-4 border-t border-neutral-800">
          <button
            @click="onCancel"
            class="px-4 py-2 text-sm font-medium transition-colors rounded text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            @click="onConfirm"
            class="px-4 py-2 text-sm font-medium text-white transition-colors rounded"
            :class="selectedMode === 'hard' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { AlertCircle } from 'lucide-vue-next'

const props = defineProps<{
  show: boolean
  shortHash: string
}>()

const emit = defineEmits<{
  confirm: [mode: 'soft' | 'mixed' | 'hard']
  cancel: []
}>()

const modeOptions = [
  { value: 'soft' as const, label: 'Soft', description: 'Keep all changes staged' },
  { value: 'mixed' as const, label: 'Mixed', description: 'Keep changes but unstaged' },
  { value: 'hard' as const, label: 'Hard', description: 'Discard all changes (destructive)' },
]

const selectedMode = ref<'soft' | 'mixed' | 'hard'>('mixed')

watch(() => props.show, (showing) => {
  if (showing) {
    selectedMode.value = 'mixed'
  }
})

const onConfirm = () => {
  emit('confirm', selectedMode.value)
}

const onCancel = () => {
  emit('cancel')
}
</script>
