<template>
  <div class="flex h-full">
    <!-- Navigation Sidebar -->
    <div class="w-64 p-2 bg-neutral-900 border-r border-neutral-800">
      <h3 class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Plugins with Settings</h3>
      <div v-if="pluginsWithSettings.length === 0" class="px-3 py-6 text-center">
        <p class="text-sm text-neutral-500">No plugins have settings configured yet</p>
      </div>
      <button
        v-for="plugin in pluginsWithSettings"
        :key="plugin.id"
        @click="selectPlugin(plugin.id)"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
          selectedPluginId === plugin.id
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
        ]"
      >
        <component :is="plugin.icon" class="w-4 h-4" />
        {{ plugin.label }}
      </button>
    </div>

    <!-- Content Area -->
    <div class="flex-1 p-8 overflow-auto">
      <div v-if="selectedPlugin">
        <h2 class="text-xl font-semibold text-white mb-6">{{ selectedPlugin.label }} Settings</h2>
        <component 
          :is="selectedPlugin.settings"
          :settings="currentPluginSettings"
          :flows="selectedPluginId === 'flows' ? flowsList : undefined"
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
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { Package, CheckCircle } from 'lucide-vue-next'
import { useSettingsSaveStatus } from '@/core/composables/useSettingsSaveStatus'
import plugins from '@/plugins'

const actor = applicationState.system.get('settings')

const selectedPluginId = useSelector(actor, (state: any) => state.context.selectedPluginId)
const settings = useSelector(actor, (state: any) => state.context.settings)

// Get flows list from flows plugin state for flows settings
const flowsActor = applicationState.system.get('flows')
const flowsList = useSelector(flowsActor, (state: any) => state.context.flows || [])

// Use the settings save status composable
const { saveStatus, updateSettings } = useSettingsSaveStatus()

// Compute current plugin settings
const currentPluginSettings = computed(() => {
  if (!selectedPluginId.value || !settings.value?.plugins) return null
  return settings.value.plugins[selectedPluginId.value]
})

// Get plugins that have settings defined
const pluginsWithSettings = computed(() => {
  return plugins.filter(plugin => plugin.settings)
})

const selectedPlugin = computed(() => {
  if (!selectedPluginId.value) return null
  return pluginsWithSettings.value.find(p => p.id === selectedPluginId.value)
})

const selectPlugin = (pluginId: string) => {
  actor.send({ type: 'PLUGIN.SELECT', pluginId })
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

.plugins-tab {
  display: flex;
  height: 100%;
  background: #0a0a0a;
}

.sidebar {
  width: 250px;
  padding: 1rem 0.5rem;
  background: rgba(255, 255, 255, 0.02);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar h3 {
  margin: 0 0 1rem 0;
  padding: 0.5rem 0.75rem;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.no-plugins {
  padding: 1.5rem 1rem;
  text-align: center;
}

.no-plugins p {
  margin: 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

.plugin-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  margin-bottom: 2px;
  text-align: left;
  font-size: 13px;
}

.plugin-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
}

.plugin-item.active {
  background: rgba(0, 122, 255, 0.15);
  color: #007AFF;
}

.plugin-icon {
  width: 16px;
  height: 16px;
  opacity: 0.8;
}

.content {
  flex: 1;
  padding: 2.5rem 3rem;
  overflow: auto;
  background: #0a0a0a;
}

.plugin-settings h2 {
  margin: 0 0 2rem 0;
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  color: rgba(255, 255, 255, 0.15);
  opacity: 1;
}

.empty-state p {
  margin: 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}
