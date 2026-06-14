<template>
  <div class="max-w-3xl">
    <CollapsibleSection label="Browser" :default-open="true" class="mb-8">
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <label for="open-links-in-app" class="text-sm font-medium text-neutral-300">
              Open links in the built-in browser
            </label>
            <p class="text-xs text-neutral-500 mt-0.5">
              When disabled, links open in your default system browser.
            </p>
          </div>
          <input
            id="open-links-in-app"
            v-model="openLinksInApp"
            type="checkbox"
            @change="saveOpenLinksInAppSetting"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>

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

        <div class="pt-4 border-t border-neutral-800">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-neutral-300">Browser cache</p>
              <p class="text-xs text-neutral-500 mt-1">Clears cookies, cached data, and storage for the built-in browser.</p>
            </div>
            <button
              v-if="!confirmingClearCache"
              @click="confirmingClearCache = true"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              <Trash2 class="w-3.5 h-3.5" />
              Clear Cache...
            </button>
            <div v-else class="flex items-center gap-2">
              <button
                @click="onClearBrowserCache"
                class="px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Clear
              </button>
              <button
                @click="confirmingClearCache = false"
                class="px-3 py-2 rounded-lg text-sm font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
          <p v-if="cacheStatus" :class="[
            'text-xs mt-3',
            cacheStatus.kind === 'success' ? 'text-green-500' : 'text-red-400'
          ]">
            {{ cacheStatus.message }}
          </p>
        </div>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'

interface BrowserSettings {
  openLinksInApp: boolean
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

const openLinksInApp = ref(props.settings?.openLinksInApp ?? true)
const showBookmarksBar = ref(props.settings?.showBookmarksBar ?? true)

watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    openLinksInApp.value = newSettings.openLinksInApp ?? true
    showBookmarksBar.value = newSettings.showBookmarksBar ?? true
  }
}, { deep: true })

const saveOpenLinksInAppSetting = () => {
  emit('update-setting', {
    path: ['openLinksInApp'],
    value: openLinksInApp.value
  })
}

const saveShowBookmarksBarSetting = () => {
  emit('update-setting', {
    path: ['showBookmarksBar'],
    value: showBookmarksBar.value
  })
}

const confirmingClearCache = ref(false)
const cacheStatus = ref<{ kind: 'success' | 'error'; message: string } | null>(null)

async function onClearBrowserCache() {
  try {
    await window.electronAPI?.browser?.clearCache()
    cacheStatus.value = { kind: 'success', message: 'Browser cache cleared.' }
  } catch (error) {
    cacheStatus.value = {
      kind: 'error',
      message: `Failed to clear browser cache: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    confirmingClearCache.value = false
  }
}
</script>
