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
      <GeneralTab v-if="activeTab === 'general' && settingsReady" />
      <PacksTab v-if="activeTab === 'packs' && settingsReady" />
      <FeaturesTab v-if="activeTab === 'features' && settingsReady" />
      <p v-if="activeTab !== 'help' && !settingsReady" class="p-8 text-sm text-neutral-400">{{ settingsStatus === 'loading' ? 'Loading settings…' : 'Settings are unavailable while the backend is disconnected.' }}</p>
      <HelpTab v-if="activeTab === 'help'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStatus, usePlugin } from '@apackdev/sdk/fe'

import { useSelector } from '@xstate/vue'
import GeneralTab from './tabs/GeneralTab.vue'
import FeaturesTab from './tabs/FeaturesTab.vue'
import PacksTab from './tabs/PacksTab.vue'
import HelpTab from './tabs/HelpTab.vue'
import type { SettingsState } from '@apackdev/host/fe'

const settingsStatus = useSettingsStatus()
const settingsReady = computed(() => settingsStatus.value === 'ready' || settingsStatus.value === 'replacing')
const actor: SettingsState = usePlugin()

const activeTab = useSelector(actor, (state) => state.context.activeTab)

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'packs', label: 'Packs' },
  { id: 'features', label: 'Features' },
  { id: 'help', label: 'Help' },
]

const selectTab = (tabId: string) => {
  actor.send({ type: 'TAB.SELECT', tab: tabId as 'general' | 'packs' | 'features' | 'help' })
}
</script>

