<template>
  <div class="flex h-full">
    <!-- Navigation Sidebar -->
    <div class="w-48 p-2 bg-neutral-900 border-r border-neutral-800">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="selectNavItem(item.id)"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
          generalNavItem === item.id
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
        ]"
      >
        <component :is="item.icon" class="w-4 h-4" />
        {{ item.label }}
      </button>
    </div>

    <!-- Content Area -->
    <div class="flex-1 p-8 overflow-auto">
      <component 
        :is="componentMap[generalNavItem]" 
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
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { User, Key, Keyboard, Settings, CheckCircle } from 'lucide-vue-next'
import PersonalInfo from '../components/GeneralSettings/PersonalInfo.vue'
import ApiKeys from '../components/GeneralSettings/ApiKeys.vue'
import Hotkeys from '../components/GeneralSettings/Hotkeys.vue'
import Misc from '../components/GeneralSettings/Misc.vue'
import { useSettingsSaveStatus } from '@/core/composables/useSettingsSaveStatus'

const actor = applicationState.system.get('settings')

const generalNavItem = useSelector(actor, (state: any) => state.context.generalNavItem)

// Use the settings save status composable
const { saveStatus, updateSettings } = useSettingsSaveStatus()

// Component mapping
const componentMap: Record<string, any> = {
  personal: PersonalInfo,
  apiKeys: ApiKeys,
  hotkeys: Hotkeys,
  misc: Misc
}

const navItems = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'apiKeys', label: 'API Keys', icon: Key },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'misc', label: 'Misc', icon: Settings },
]

const selectNavItem = (itemId: string) => {
  actor.send({ type: 'GENERAL_NAV.SELECT', item: itemId as 'personal' | 'apiKeys' | 'hotkeys' | 'misc' })
}

// Handle update events from child components
const handleUpdateSetting = (event: { path: string[], value: any }) => {
  // Map the current nav item to the appropriate label
  const labelMap = {
    personal: 'personal',
    apiKeys: 'apikeys',
    hotkeys: 'hotkeys',
    misc: 'misc'
  }
  
  updateSettings({
    entityType: 'general',
    label: labelMap[generalNavItem.value as keyof typeof labelMap],
    path: event.path,
    value: event.value
  })
}
</script>

