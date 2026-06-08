<template>
  <div class="max-w-3xl">
    <CollapsibleSection label="Browser" :default-open="true" class="mb-8">
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <label for="show-bookmarks-bar" class="text-sm font-medium text-neutral-300">
              Show bookmarks bar
            </label>
            <p class="text-xs text-neutral-500 mt-0.5">
              Display the bookmarks bar below the address bar
            </p>
          </div>
          <input
            id="show-bookmarks-bar"
            v-model="showBookmarksBar"
            type="checkbox"
            @change="saveShowBookmarksBarSetting"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'

interface BrowserSettings {
  showBookmarksBar: boolean
}

interface Props {
  settings?: BrowserSettings
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{ path: string[], value: any }]
}>()

const showBookmarksBar = ref(props.settings?.showBookmarksBar ?? true)

watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    showBookmarksBar.value = newSettings.showBookmarksBar ?? true
  }
}, { deep: true })

const saveShowBookmarksBarSetting = () => {
  emit('update-setting', {
    path: ['showBookmarksBar'],
    value: showBookmarksBar.value
  })
}
</script>
