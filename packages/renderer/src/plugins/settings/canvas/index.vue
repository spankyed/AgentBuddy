<template>
  <div class="settings-container">
    <!-- Tabs -->
    <div class="tabs-container">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="selectTab(tab.id)"
        :class="['tab-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <GeneralTab v-if="activeTab === 'general'" />
      <PluginsTab v-if="activeTab === 'plugins'" />
      <FAQTab v-if="activeTab === 'faq'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import GeneralTab from './tabs/GeneralTab.vue'
import PluginsTab from './tabs/PluginsTab.vue'
import FAQTab from './tabs/FAQTab.vue'

const actor = applicationState.system.get('settings')

const activeTab = useSelector(actor, (state: any) => state.context.activeTab)

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'faq', label: 'FAQ' },
]

const selectTab = (tabId: string) => {
  actor.send({ type: 'TAB.SELECT', tab: tabId as 'general' | 'plugins' | 'faq' })
}
</script>

<style scoped>
.settings-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.tabs-container {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.tab-button {
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  font-weight: 500;
}

.tab-button:hover {
  background: var(--color-background-mute);
}

.tab-button.active {
  background: var(--color-primary);
  color: white;
}

.tab-content {
  flex: 1;
  overflow: auto;
}
</style>