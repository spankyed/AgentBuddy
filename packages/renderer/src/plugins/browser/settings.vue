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

    <CollapsibleSection label="Passkeys" :default-open="true" class="mb-8">
      <div v-if="passkeys.length === 0" class="text-xs text-neutral-500">
        No passkeys saved. Passkeys created in the browser will appear here.
      </div>
      <div v-else class="space-y-1">
        <div
          v-for="passkey in passkeys"
          :key="passkey.credentialId"
          class="group flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-neutral-800/50"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium text-neutral-300 truncate">
              {{ passkey.rpId || 'Unknown site' }}
            </div>
            <div v-if="passkey.userName || passkey.userDisplayName" class="text-xs text-neutral-500 truncate">
              {{ passkey.userName || passkey.userDisplayName }}
            </div>
          </div>
          <button
            v-if="confirmingDelete !== passkey.credentialId"
            class="shrink-0 p-1 rounded text-neutral-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-neutral-700/50 transition-colors"
            title="Delete passkey"
            @click="confirmingDelete = passkey.credentialId"
          >
            <Trash2 :size="14" />
          </button>
          <button
            v-else
            class="shrink-0 px-2 py-0.5 rounded text-xs font-medium text-red-400 bg-red-950/50 border border-red-900 hover:bg-red-900/50"
            @click="deletePasskey(passkey.credentialId)"
            @blur="confirmingDelete = null"
          >
            Confirm?
          </button>
        </div>
      </div>
      <p class="text-xs text-neutral-500 mt-3">
        Passkeys are stored encrypted on this machine. Deleting one here does not
        remove it from the website's account settings.
      </p>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Trash2 } from 'lucide-vue-next'
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

// Passkey management — live data from the main process, not a persisted setting
interface PasskeyInfo {
  credentialId: string
  rpId?: string
  userName?: string
  userDisplayName?: string
}

const passkeys = ref<PasskeyInfo[]>([])
const confirmingDelete = ref<string | null>(null)

const refreshPasskeys = async () => {
  passkeys.value = await window.electronAPI?.browser.getPasskeys() ?? []
}

const deletePasskey = async (credentialId: string) => {
  confirmingDelete.value = null
  await window.electronAPI?.browser.deletePasskey(credentialId)
  await refreshPasskeys()
}

onMounted(refreshPasskeys)
</script>
