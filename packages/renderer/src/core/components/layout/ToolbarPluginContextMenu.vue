<template>
  <ContextMenuPopup
    :show="showMenu"
    :pos="menuPos"
    :items="menuItems"
    :label="selectedPlugin?.label"
    @close="showMenu = false"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExternalLink, EyeOff, Settings as SettingsIcon } from 'lucide-vue-next';
import type { Plugin } from '@/core/types';
import ContextMenuPopup from '@abuddy/ui/design/ContextMenuPopup.vue';
import { useSettingsSaveStatus, navigateToPlugin, getDesignated } from '@abuddy/sdk/fe';
import { useContextMenu, type MenuItem } from '@abuddy/ui/composables/useContextMenu';

const { showMenu, menuPos, open: openMenu } = useContextMenu();
const { updateSettings } = useSettingsSaveStatus();
const selectedPlugin = ref<Plugin | null>(null);

const menuItems = computed<MenuItem[]>(() => {
  const plugin = selectedPlugin.value;
  if (!plugin) return [];

  if (plugin.id === getDesignated('settings')) {
    return [
      {
        label: 'Pop Out',
        icon: ExternalLink,
        class: 'text-neutral-200',
        iconClass: 'text-neutral-500',
        action: () => window.electronAPI?.plugins?.popout(plugin.id, plugin.label),
      },
    ];
  }

  return [
    {
      label: 'Pop Out',
      icon: ExternalLink,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => window.electronAPI?.plugins?.popout(plugin.id, plugin.label),
    },
    {
      label: `Hide ${plugin.label}`,
      icon: EyeOff,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => updateSettings({
        entityType: 'plugin',
        label: '_meta',
        path: ['visibility', plugin.id],
        value: false,
      }),
    },
    {
      label: `${plugin.label} Settings`,
      icon: SettingsIcon,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => navigateToPlugin(getDesignated('settings'), [
        { type: 'TAB.SELECT', tab: 'plugins' },
        { type: 'PLUGIN.SELECT', pluginId: plugin.id },
      ]),
    },
  ];
});

const open = (event: MouseEvent, plugin: Plugin) => {
  selectedPlugin.value = plugin;
  openMenu(event, menuItems.value.length, plugin.label ? 32 : 0);
};

defineExpose({ open });
</script>
