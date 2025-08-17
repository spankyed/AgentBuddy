<template>
  <div class="general-tab">
    <!-- Navigation Sidebar -->
    <div class="sidebar">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="selectNavItem(item.id)"
        :class="['nav-item', { active: generalNavItem === item.id }]"
      >
        <component :is="item.icon" class="nav-icon" />
        {{ item.label }}
      </button>
    </div>

    <!-- Content Area -->
    <div class="content">
      <PersonalInfo v-if="generalNavItem === 'personal'" />
      <ApiKeys v-if="generalNavItem === 'apiKeys'" />
      <Hotkeys v-if="generalNavItem === 'hotkeys'" />
      <Misc v-if="generalNavItem === 'misc'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { User, Key, Keyboard, Settings } from 'lucide-vue-next'
import PersonalInfo from '../components/GeneralSettings/PersonalInfo.vue'
import ApiKeys from '../components/GeneralSettings/ApiKeys.vue'
import Hotkeys from '../components/GeneralSettings/Hotkeys.vue'
import Misc from '../components/GeneralSettings/Misc.vue'

const actor = applicationState.system.get('settings')

const generalNavItem = useSelector(actor, (state: any) => state.context.generalNavItem)

const navItems = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'apiKeys', label: 'API Keys', icon: Key },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'misc', label: 'Misc', icon: Settings },
]

const selectNavItem = (itemId: string) => {
  actor.send({ type: 'GENERAL_NAV.SELECT', item: itemId as 'personal' | 'apiKeys' | 'hotkeys' | 'misc' })
}
</script>

<style scoped>
.general-tab {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 200px;
  padding: 1rem;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}

.nav-item {
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

.nav-item:hover {
  background: var(--color-background-mute);
}

.nav-item.active {
  background: var(--color-primary);
  color: white;
}

.nav-icon {
  width: 18px;
  height: 18px;
}

.content {
  flex: 1;
  padding: 2rem;
  overflow: auto;
}
</style>