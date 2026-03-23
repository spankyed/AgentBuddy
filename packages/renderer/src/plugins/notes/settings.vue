<template>
  <div class="max-w-3xl">
    <CollapsibleSection label="Task List" :default-open="true" class="mb-8">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-neutral-300 min-w-[120px]">
            Panel Position:
          </label>
          <div class="flex gap-1">
            <button
              v-for="option in positionOptions"
              :key="option.value"
              @click="updatePosition(option.value)"
              :class="[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                panelPosition === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 border border-neutral-700/50'
              ]"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'

interface NotesSettings {
  tasklistPanelPosition: 'left' | 'right'
}

interface Props {
  settings?: NotesSettings
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

const positionOptions = [
  { value: 'left' as const, label: 'Left' },
  { value: 'right' as const, label: 'Right' },
]

const panelPosition = ref<'left' | 'right'>(props.settings?.tasklistPanelPosition || 'left')

watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    panelPosition.value = newSettings.tasklistPanelPosition
  }
}, { deep: true })

const updatePosition = (value: 'left' | 'right') => {
  panelPosition.value = value
  emit('update-setting', {
    path: ['tasklistPanelPosition'],
    value
  })
}
</script>
