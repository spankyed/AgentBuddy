<template>
  <div class="max-w-3xl">
    <!-- Database Hotkeys Section -->
    <CollapsibleSection label="Database Hotkeys" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Keyboard shortcuts for database operations
      </p>
      <div class="space-y-6">
        <div class="group">
          <KeyboardShortcutInput
            v-model="hotkeys.executeQuery"
            id="execute-query"
            label="Execute Query"
            @change="saveHotkeys"
            container-class="flex-1"
            :show-reset-button="true"
          />
          <p class="mt-1.5 text-xs text-neutral-600">
            Run the current query or transaction in the editor
          </p>
        </div>

        <!-- Future hotkeys can be added here -->
      </div>
    </CollapsibleSection>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import KeyboardShortcutInput from '@/core/components/design/KeyboardShortcutInput.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import type { DatabaseSettings } from '@app/api'

interface Props {
  settings?: DatabaseSettings
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

// State - initialize directly from props with defaults
const hotkeys = reactive<DatabaseSettings['hotkeys']>({
  executeQuery: props.settings?.hotkeys?.executeQuery || undefined
})

// Save function
const saveHotkeys = () => {
  emit('update-setting', {
    path: ['hotkeys'],
    value: hotkeys
  })
}
</script>