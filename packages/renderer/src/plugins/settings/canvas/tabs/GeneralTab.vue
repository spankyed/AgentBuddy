<template>
  <div class="flex h-full">
    <!-- Navigation Sidebar -->
    <div class="w-48 p-2 bg-neutral-900 border-r border-neutral-800 overflow-auto flex flex-col">
      <div class="flex-1">
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
      <div class="border-t border-neutral-800 pt-2 mt-2">
        <button
          v-for="item in bottomNavItems"
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
    </div>

    <!-- Content Area -->
    <div class="flex-1 p-8 overflow-auto">
      <component
        :is="componentMap[generalNavItem]"
        :settings="currentSettings"
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
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { User, Key, Settings, CheckCircle, Briefcase, FileJson } from 'lucide-vue-next'
import PersonalInfo from '../components/GeneralSettings/PersonalInfo.vue'
import Secrets from '../components/GeneralSettings/Secrets.vue'
import App from '../components/GeneralSettings/App.vue'
import Projects from '../components/GeneralSettings/Projects.vue'
import SettingsJsonEditor from '../components/GeneralSettings/SettingsJsonEditor.vue'
import { useSettingsSaveStatus } from '@/core/composables/useSettingsSaveStatus'

const actor = applicationState.system.get('settings')

const generalNavItem = useSelector(actor, (state: any) => state.context.generalNavItem)
const settings = useSelector(actor, (state: any) => state.context.settings)

// Use the settings save status composable
const { saveStatus, updateSettings } = useSettingsSaveStatus()

// Compute current settings based on selected nav item
const currentSettings = computed(() => {
  if (!settings.value?.general) return null

  const settingsMap = {
    personal: settings.value.general.personal,
    secrets: settings.value.general.secrets,
    projects: settings.value.general.projects,
    application: settings.value.general.application
  }

  return settingsMap[generalNavItem.value as keyof typeof settingsMap]
})

// Component mapping
const componentMap: Record<string, any> = {
  personal: PersonalInfo,
  secrets: Secrets,
  projects: Projects,
  application: App,
  json: SettingsJsonEditor,
}

const navItems = [
  { id: 'application', label: 'Application', icon: Settings },
  { id: 'secrets', label: 'Providers', icon: Key },
  { id: 'projects', label: 'Projects', icon: Briefcase },
  { id: 'personal', label: 'Personal', icon: User },
]

const bottomNavItems = [
  { id: 'json', label: 'JSON', icon: FileJson },
]

const selectNavItem = (itemId: string) => {
  actor.send({ type: 'GENERAL_NAV.SELECT', item: itemId as 'personal' | 'secrets' | 'projects' | 'application' | 'json' })
}

// Handle update events from child components
const handleUpdateSetting = (event: { path: string[], value: any }) => {
  // Map the current nav item to the appropriate label
  const labelMap = {
    personal: 'personal',
    secrets: 'secrets',
    projects: 'projects',
    application: 'application'
  } as const

  const currentNavItem = generalNavItem.value as keyof typeof labelMap
  const backendLabel = labelMap[currentNavItem]

  // Defensive check to prevent undefined labels
  if (!backendLabel) {
    console.log('event.path: ', event.path);
    console.log('backendLabel: ', backendLabel);
    console.error(`[GeneralTab] Invalid generalNavItem value: "${generalNavItem.value}". Expected one of: ${Object.keys(labelMap).join(', ')}`)
    console.error('[GeneralTab] Skipping settings update to prevent data corruption')
    return
  }

  updateSettings({
    entityType: 'general',
    label: backendLabel,
    path: event.path,
    value: event.value
  })
}
</script>
