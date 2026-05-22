<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Tabs -->
    <div class="flex border-b border-neutral-800">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="selectTab(tab.id)"
        :data-onboarding-id="`settings-${tab.id}-tab`"
        :class="[
          'flex-1 px-4 py-3 text-sm font-medium transition-colors relative',
          activeTab === tab.id
            ? 'text-white border-b-2 border-blue-500'
            : 'text-neutral-400 hover:text-neutral-200'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-hidden">
      <GeneralTab v-if="activeTab === 'general'" />
      <PluginsTab v-if="activeTab === 'plugins'" />
      <ServicesTab v-if="activeTab === 'services'" />
      <HelpTab v-if="activeTab === 'help'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import GeneralTab from './tabs/GeneralTab.vue'
import PluginsTab from './tabs/PluginsTab.vue'
import ServicesTab from './tabs/ServicesTab.vue'
import HelpTab from './tabs/HelpTab.vue'

const actor = applicationState.system.get('settings')

const activeTab = useSelector(actor, (state: any) => state.context.activeTab)

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'services', label: 'Services' },
  { id: 'help', label: 'Help' },
]

const selectTab = (tabId: string) => {
  actor.send({ type: 'TAB.SELECT', tab: tabId as 'general' | 'plugins' | 'services' | 'help' })
}
</script>

