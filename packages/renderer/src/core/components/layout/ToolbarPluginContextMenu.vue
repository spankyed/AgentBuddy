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
import ContextMenuPopup from '@/core/components/design/ContextMenuPopup.vue';
import { useContextMenu, type MenuItem } from '@/core/composables/useContextMenu';
import { useSettingsSaveStatus } from '@/core/composables/useSettingsSaveStatus';
import { navigateToPlugin } from '@/core/utils/navigate';

const { showMenu, menuPos, open: openMenu } = useContextMenu();
const { updateSettings } = useSettingsSaveStatus();
const selectedPlugin = ref<Plugin | null>(null);

const menuItems = computed<MenuItem[]>(() => {
  const plugin = selectedPlugin.value;
  if (!plugin) return [];

  const canHide = plugin.id !== 'settings';
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
      class: canHide ? 'text-neutral-200' : 'text-neutral-600 cursor-not-allowed',
      iconClass: canHide ? 'text-neutral-500' : 'text-neutral-600',
      action: () => canHide && updateSettings({
        entityType: 'plugin',
        label: '_meta',
        path: ['visibility', plugin.id],
        value: false,
      }),
      keepOpen: !canHide,
    },
    {
      label: `${plugin.label} Settings`,
      icon: SettingsIcon,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => navigateToPlugin('settings', [
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
