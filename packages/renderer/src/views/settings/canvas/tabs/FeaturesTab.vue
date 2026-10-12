<template>
  <div class="flex h-full">
    <!-- Navigation Sidebar -->
    <div ref="sidebarRef" class="w-64 p-2 bg-neutral-900 border-r border-neutral-800 overflow-auto">
      <h3 class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Features with Settings</h3>
      <div v-if="featuresWithSettings.length === 0" class="px-3 py-6 text-center">
        <p class="text-sm text-neutral-500">No features have settings configured yet</p>
      </div>
      <div
        v-for="plugin in featuresWithSettings"
        :key="plugin.id"
        :data-active="selectedFeature?.id === plugin.id"
        class="flex items-center gap-1 mb-0.5"
      >
        <button
          @click="selectFeature(plugin.id)"
          :class="[
            'flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
            selectedFeature?.id === plugin.id
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
          ]"
        >
          <component :is="plugin.icon" class="w-4 h-4" />
          {{ plugin.label }}
        </button>
        <button
          @click="togglePluginVisibility(plugin.id)"
          :disabled="plugin.id === settingsPluginId"
          :title="plugin.id === settingsPluginId ? 'Settings must remain visible' : (isPluginVisible(plugin.id) ? 'Hide from toolbar' : 'Show in toolbar')"
          :class="[
            'p-2 rounded-md transition-colors',
            plugin.id === settingsPluginId 
              ? 'text-neutral-600 cursor-not-allowed' 
              : isPluginVisible(plugin.id)
                ? 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                : 'text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800'
          ]"
        >
          <component 
            :is="isPluginVisible(plugin.id) ? Eye : EyeOff" 
            class="w-4 h-4" 
          />
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 p-8 overflow-auto">
      <div v-if="selectedFeature">
        <div class="flex items-center gap-3 mb-6">
          <h2 class="text-xl font-semibold text-white">{{ selectedFeature.label }} Settings</h2>
          <button data-testid="feature-help" :aria-label="`Help for ${selectedFeature.label}`" v-if="hasHelp(selectedFeature.id)" @click="openFeatureHelp(selectedFeature.id)" class="text-sm text-neutral-400 underline">Help</button>
          <button
            v-if="selectedFeature.id !== settingsPluginId"
            @click="goToPlugin(selectedFeature.id)"
            title="Open feature"
            class="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <ExternalLink class="w-4 h-4" />
          </button>
          <!-- Always offered: what the view holds is the settings *in effect*, defaults merged in, so it
               cannot tell whether the user stored anything — and a reset with nothing stored is a no-op -->
          <button
            @click="showResetDialog = true"
            title="Reset this feature's settings to their defaults"
            class="ml-auto p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <RotateCcw class="w-4 h-4" />
          </button>
        </div>
        <!-- A plugin's settings render as part of that plugin, so usePlugin() there is the plugin's own -->
        <PluginScope :plugin="selectedFeature.id" :key="selectedFeature.id">
          <component
            :is="selectedFeature.settings"
            v-if="currentFeatureSettings"
            :settings="currentFeatureSettings"
            :all-settings="settings"
            @update-setting="handleUpdateSetting"
          />
        </PluginScope>
        
        <!-- Save Status Indicator -->
        <div class="mt-6 flex items-center gap-2">
          <div v-if="saveStatus === 'saving'" class="flex items-center gap-2 text-xs text-neutral-500">
            <div class="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"></div>
            Saving...
          </div>
          <div v-else-if="saveStatus === 'saved'" class="flex items-center gap-2 text-xs text-green-600">
            <CheckCircle class="w-3 h-3" />
            Settings saved
          </div>
          <div v-else-if="saveStatus === 'refused'" class="flex items-center gap-2 text-xs text-red-400">{{ problems.join('; ') }}</div>
        </div>
      </div>
      <div v-else class="flex flex-col items-center justify-center h-full">
        <Package class="w-16 h-16 text-neutral-700 mb-4" />
        <p class="text-neutral-400">Select a feature to configure its settings</p>
      </div>
    </div>

    <!-- Resetting is removing what the user stored, after which the pack's current defaults apply again — so
         the copy says "defaults" rather than naming values, and a pack whose defaults moved resets to those -->
    <ConfirmationDialog
      v-if="selectedFeature"
      v-model="showResetDialog"
      title="Reset settings"
      :description="`Forget your changes to ${selectedFeature.label}'s settings? Its defaults will apply again.`"
      confirm-text="Reset"
      variant="danger"
      @confirm="resetSelectedFeature"
    />
  </div>
</template>

<script setup lang="ts">
import { useContextualHelp } from '@/views/settings/contextual-help';
const { hasHelp, openFeatureHelp } = useContextualHelp();
import { computed, ref, watch, onMounted, onUpdated } from 'vue'
import type { SettingUpdate } from '@apackdev/sdk/fe'
import { useSelector } from '@xstate/vue'
import { untypedOpenPlugin, PluginScope, usePlugin, useShell } from '@apackdev/sdk/fe'
import ConfirmationDialog from '@apackdev/ui/design/ConfirmationDialog'
import { Package, CheckCircle, Eye, EyeOff, ExternalLink, RotateCcw } from 'lucide-vue-next'
import { useSettingsSaveStatus } from '@/views/settings/save'
import { HOST, type SettingsState } from '@apackdev/host/fe'
import type { FeatureRef } from '@apackdev/sdk/ids'

const shell = useShell()

const actor: SettingsState = usePlugin()
const allPlugins = shell.plugins

const selectedFeatureId = useSelector(actor, (state) => state.context.selectedFeatureId)
const settings = useSelector(actor, (state) => state.context.settings)

const showResetDialog = ref(false)
/**
 * Forgets what the user stored for this plugin. Sent to the view's own actor rather than through
 * `@apackdev/sdk/fe`'s `resetSettings`: that is the door for a pack's component, and this *is* the view.
 */
function resetSelectedFeature() {
  if (!selectedFeature.value) return
  actor.send({ type: 'SETTINGS.RESET', target: { entityType: 'feature', label: selectedFeature.value.id } })
}

const sidebarRef = ref<HTMLElement | null>(null)
function scrollToActive() {
  sidebarRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}
onMounted(scrollToActive)
onUpdated(scrollToActive)

// Use the settings save status composable
const { saveStatus, problems, updateSettings } = useSettingsSaveStatus()

// Compute current feature settings
const currentFeatureSettings = computed(() => {
  if (!selectedFeature.value || !settings.value?.features) return null
  return settings.value.features[selectedFeature.value.id]
})

const featuresWithSettings = computed(() => {
  return allPlugins.value.filter((plugin) => plugin.settings)
})

// The first plugin with settings until one is picked
const selectedFeature = computed(() =>
  featuresWithSettings.value.find((p) => p.id === selectedFeatureId.value) ?? featuresWithSettings.value[0] ?? null
)

// A confirmation names the plugin it was opened for, so a change of selection closes it rather than
// retargeting the reset at whatever is selected when it is confirmed
watch(
  () => selectedFeature.value?.id,
  () => {
    showResetDialog.value = false
  }
)

const selectFeature = (featureId: FeatureRef) => {
  actor.send({ type: 'FEATURE.SELECT', featureId })
}

// `pluginId` is a registered plugin's id: data, so it opens through the checked door
const goToPlugin = (pluginId: string) => {
  untypedOpenPlugin(pluginId)
}

// Whether a plugin's tab shows: the app shell's state
const isPluginVisible = (pluginId: string) => {
  return shell.pluginVisibility.value[pluginId] !== false
}

// Toggle plugin visibility
const settingsPluginId = HOST.settings

const togglePluginVisibility = (pluginId: string) => {
  if (pluginId === settingsPluginId) return
  
  shell.setPluginVisible(pluginId, !isPluginVisible(pluginId))
}

// Handle update events from child components
const handleUpdateSetting = (event: SettingUpdate) => {
  if (!selectedFeature.value) return

  updateSettings({
    entityType: 'feature',
    // A registered plugin's id is its ref
    label: selectedFeature.value.id,
    path: event.path,
    value: event.value
  })
}
</script>
