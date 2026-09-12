<template>
  <div class="flex h-full">
    <!-- Navigation Sidebar -->
    <div ref="sidebarRef" class="w-64 p-2 bg-neutral-900 border-r border-neutral-800 overflow-auto">
      <h3 class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Plugins with Settings</h3>
      <div v-if="pluginsWithSettings.length === 0" class="px-3 py-6 text-center">
        <p class="text-sm text-neutral-500">No plugins have settings configured yet</p>
      </div>
      <div
        v-for="plugin in pluginsWithSettings"
        :key="plugin.id"
        :data-active="selectedPluginId === plugin.id"
        class="flex items-center gap-1 mb-0.5"
      >
        <button
          @click="selectPlugin(plugin.id)"
          :class="[
            'flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
            selectedPluginId === plugin.id
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
      <div v-if="selectedPlugin">
        <div class="flex items-center gap-3 mb-6">
          <h2 class="text-xl font-semibold text-white">{{ selectedPlugin.label }} Settings</h2>
          <button
            v-if="selectedPlugin.id !== 'settings'"
            @click="goToPlugin(selectedPlugin.id)"
            title="Go to plugin"
            class="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <ExternalLink class="w-4 h-4" />
          </button>
        </div>
        <component 
          :is="selectedPlugin.settings"
          :settings="currentPluginSettings"
          :all-settings="settings"
          @update-setting="handleUpdateSetting"
        />
        
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
        </div>
      </div>
      <div v-else class="flex flex-col items-center justify-center h-full">
        <Package class="w-16 h-16 text-neutral-700 mb-4" />
        <p class="text-neutral-400">Select a plugin to configure its settings</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUpdated } from 'vue'
import { useSelector } from '@xstate/vue'
import { useActorSystem, useApplicationActor, navigateToPlugin, getDesignated } from '@abuddy/sdk/fe'
import { Package, CheckCircle, Eye, EyeOff, ExternalLink } from 'lucide-vue-next'
import { useSettingsSaveStatus } from '@abuddy/sdk/fe'

const actorSystem = useActorSystem()
const applicationActor = useApplicationActor()

const actor = actorSystem.get('settings')
const allPlugins = useSelector(applicationActor, (state: any) => state.context.plugins)

const selectedPluginId = useSelector(actor, (state: any) => state.context.selectedPluginId)
const settings = useSelector(actor, (state: any) => state.context.settings)

const sidebarRef = ref<HTMLElement | null>(null)
function scrollToActive() {
  sidebarRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}
onMounted(scrollToActive)
onUpdated(scrollToActive)

// Use the settings save status composable
const { saveStatus, updateSettings } = useSettingsSaveStatus()

// Compute current plugin settings
const currentPluginSettings = computed(() => {
  if (!selectedPluginId.value || !settings.value?.plugins) return null
  return settings.value.plugins[selectedPluginId.value]
})

const pluginsWithSettings = computed(() => {
  return allPlugins.value.filter((plugin: any) => plugin.settings)
})

const selectedPlugin = computed(() => {
  if (!selectedPluginId.value) return null
  return pluginsWithSettings.value.find((p: any) => p.id === selectedPluginId.value)
})

const selectPlugin = (pluginId: string) => {
  actor.send({ type: 'PLUGIN.SELECT', pluginId })
}

const goToPlugin = (pluginId: string) => {
  navigateToPlugin(pluginId)
}

// Check if a plugin is visible
const isPluginVisible = (pluginId: string) => {
  return settings.value?.plugins?._meta?.visibility?.[pluginId] !== false
}

// Toggle plugin visibility
const settingsPluginId = getDesignated('settings')

const togglePluginVisibility = (pluginId: string) => {
  if (pluginId === settingsPluginId) return
  
  const currentVisibility = isPluginVisible(pluginId)
  
  updateSettings({
    entityType: 'plugin',
    label: '_meta',
    path: ['visibility', pluginId],
    value: !currentVisibility
  })
}

// Handle update events from child components
const handleUpdateSetting = (event: { path: string[], value: any }) => {
  if (!selectedPluginId.value) return
  
  updateSettings({
    entityType: 'plugin',
    label: selectedPluginId.value,
    path: event.path,
    value: event.value
  })
}
</script>
