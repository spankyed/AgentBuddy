<template>
  <div class="plugins-tab">
    <!-- Navigation Sidebar -->
    <div class="sidebar">
      <h3>Plugins with Settings</h3>
      <div v-if="pluginsWithSettings.length === 0" class="no-plugins">
        <p>No plugins have settings configured yet</p>
      </div>
      <button
        v-for="plugin in pluginsWithSettings"
        :key="plugin.id"
        @click="selectPlugin(plugin.id)"
        :class="['plugin-item', { active: selectedPluginId === plugin.id }]"
      >
        <component :is="plugin.icon" class="plugin-icon" />
        {{ plugin.label }}
      </button>
    </div>

    <!-- Content Area -->
    <div class="content">
      <div v-if="selectedPlugin" class="plugin-settings">
        <h2>{{ selectedPlugin.label }} Settings</h2>
        <component :is="selectedPlugin.settings" />
      </div>
      <div v-else class="empty-state">
        <Package class="empty-icon" />
        <p>Select a plugin to configure its settings</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { Package } from 'lucide-vue-next'
import plugins from '@/plugins'

const actor = applicationState.system.get('settings')

const selectedPluginId = useSelector(actor, (state: any) => state.context.selectedPluginId)

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
</script>

<style scoped>
.plugins-tab {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 250px;
  padding: 1rem;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}

.sidebar h3 {
  margin: 0 0 1rem 0;
  padding: 0.5rem;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.no-plugins {
  padding: 1rem;
  text-align: center;
}

.no-plugins p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.plugin-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  margin-bottom: 0.25rem;
  text-align: left;
}

.plugin-item:hover {
  background: var(--color-background-mute);
}

.plugin-item.active {
  background: var(--color-primary);
  color: white;
}

.plugin-icon {
  width: 18px;
  height: 18px;
}

.content {
  flex: 1;
  padding: 2rem;
  overflow: auto;
}

.plugin-settings h2 {
  margin-bottom: 1.5rem;
  color: var(--color-heading);
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
  color: var(--color-text-secondary);
  opacity: 0.3;
}

.empty-state p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 16px;
}
</style>