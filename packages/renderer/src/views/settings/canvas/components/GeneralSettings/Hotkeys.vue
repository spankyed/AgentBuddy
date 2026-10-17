<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Keyboard Shortcuts</h2>
      <p class="text-sm text-neutral-500">
        Configure keyboard shortcuts for common actions in the application.
      </p>
    </div>

    <!-- Form Fields -->
    <div class="space-y-6">
      <!-- Switch Plugin Hotkeys -->
      <div class="group">
        <div class="flex gap-4 max-w-3xl">
          <KeyboardShortcutInput
            v-model="builtInHotkeys.switchPluginUp"
            id="switch-plugin-up"
            label="Previous Plugin"
            @change="updateHotkeys"
            container-class="flex-1"
            :show-reset-button="false"
          />
          
          <KeyboardShortcutInput
            v-model="builtInHotkeys.switchPluginDown"
            id="switch-plugin-down"
            label="Next Plugin"
            @change="updateHotkeys"
            container-class="flex-1"
            :show-reset-button="false"
          />
        </div>
        
        <p class="mt-2 text-xs text-neutral-600">
          Navigate between plugins using keyboard shortcuts
        </p>
      </div>

      <!-- Toggle Inspection Panel -->
      <div class="group">
        <div class="flex gap-4 max-w-3xl">
          <KeyboardShortcutInput
            v-model="builtInHotkeys.toggleInspectionPanel"
            id="toggle-inspection"
            label="Toggle Inspection Panel"
            @change="updateHotkeys"
            container-class="flex-1"
            :show-reset-button="false"
          />
          <div class="flex-1"></div> <!-- Empty spacer to maintain consistent width -->
        </div>
        <p class="mt-2 text-xs text-neutral-600">
          Show or hide the inspection panel
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Custom Keyboard Shortcuts -->
      <div class="group">
        <h3 class="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-4">Custom Keyboard Shortcuts</h3>
        
        <!-- Custom hotkeys list -->
        <div v-if="customHotkeys.length > 0" class="space-y-3 mb-4">
          <div v-for="(hotkey, index) in customHotkeys" :key="hotkey.id" class="border rounded-md bg-neutral-800/50 border-neutral-700">
            <div class="flex items-center gap-2 p-2">
              <!-- Event Name Input -->
              <input
                v-model="hotkey.eventName"
                type="text"
                placeholder="EVENT_NAME"
                class="flex-1 px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-600 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
                @input="debouncedSave"
              />

              <!-- Keyboard Shortcut Input -->
              <KeyboardShortcutInput
                v-model="hotkey.shortcut"
                @change="updateCustomHotkey()"
                container-class="flex-1"
                placeholder="Click to set shortcut"
                :show-reset-button="false"
              />

              <!-- Remove Button -->
              <button
                @click="removeCustomHotkey(index)"
                class="p-1 rounded-md hover:bg-neutral-700 hover:text-red-400 transition-all"
                title="Remove shortcut"
              >
                <X class="w-4 h-4 text-neutral-400" />
              </button>
            </div>
          </div>
        </div>

        <!-- Add button -->
        <button
          @click="addCustomHotkey"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
        >
          <Plus class="w-4 h-4" />
          Add Custom Shortcut
        </button>
      </div>
    </div>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSettingsDraft } from '@apackdev/sdk/fe'
import { useWindowSettingsSnapshot } from '@/runtime/settings'
import { X, Plus } from 'lucide-vue-next'
import KeyboardShortcutInput from '@apackdev/ui/components/KeyboardShortcutInput'
import { useDebounce } from '@apackdev/ui/composables/useDebounce'
import type { ApplicationHotkeys, KeyboardShortcut } from '@apackdev/sdk/types'
import type { SettingUpdate } from '@apackdev/sdk/fe'

interface Props {
  settings?: ApplicationHotkeys
}

// `settings` is optional, so it is already undefined when the tab has no slice for this form; the forms read it
// with `?.`, so the default that turned it into null was never a distinction either of them could see.
const props = defineProps<Props>()

const emit = defineEmits<{
  'update-setting': [SettingUpdate]
}>()

// Copy each shortcut's array before editing or sending it; preserve optional fields such as global.
const copyShortcut = (shortcut?: KeyboardShortcut | null): KeyboardShortcut | undefined => shortcut ? {
  ...shortcut, modifiers: [...shortcut.modifiers]
} : undefined

const snapshot = useWindowSettingsSnapshot()
const draft = useSettingsDraft(() => ({
  builtIn: {
    switchPluginUp: copyShortcut(props.settings?.switchPluginUp) ?? null,
    switchPluginDown: copyShortcut(props.settings?.switchPluginDown) ?? null,
    toggleInspectionPanel: copyShortcut(props.settings?.toggleInspectionPanel) ?? null
  },
  custom: (props.settings?.custom ?? []).map(h => ({
    id: h.id, eventName: h.eventName, shortcut: copyShortcut(h) ?? null
  }))
}))
const builtInHotkeys = computed(() => draft.value.builtIn)
const customHotkeys = computed(() => draft.value.custom)
const { debounced: debouncedSave, cancel } = useDebounce(saveHotkeys, 500)
watch(() => [JSON.stringify(props.settings), snapshot.value?.runId], cancel)

function saveHotkeys() {
  emit('update-setting', {
    path: [],
    value: {
      ...Object.fromEntries(Object.entries(builtInHotkeys.value)
        .filter(([, shortcut]) => shortcut !== null)
        .map(([id, shortcut]) => [id, copyShortcut(shortcut)])),
      custom: customHotkeys.value.map(h => ({
        ...(copyShortcut(h.shortcut) ?? { key: '', modifiers: [] }), id: h.id, eventName: h.eventName
      }))
    },
    condition: snapshot.value ? {
      runId: snapshot.value.runId,
      expected: props.settings === undefined ? { exists: false }
        : { exists: true, value: JSON.parse(JSON.stringify(props.settings)) }
    } : undefined
  })
}

const updateHotkeys = saveHotkeys
const updateCustomHotkey = saveHotkeys
const addCustomHotkey = () => customHotkeys.value.push({
  id: crypto.randomUUID(), eventName: '', shortcut: null
})
const removeCustomHotkey = (index: number) => {
  customHotkeys.value.splice(index, 1)
  saveHotkeys()
}
</script>


