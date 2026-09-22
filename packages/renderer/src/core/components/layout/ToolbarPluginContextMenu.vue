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
import ContextMenuPopup from '@abuddy/ui/design/ContextMenuPopup';
import { useApplicationActor, openRef, getDesignated } from '@abuddy/sdk/fe';
import { useContextMenu, type MenuItem } from '@abuddy/ui/composables/useContextMenu';

const { showMenu, menuPos, open: openMenu } = useContextMenu();
const applicationActor = useApplicationActor();
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
      action: () => applicationActor.send({ type: 'SET_PLUGIN_VISIBILITY', plugin: plugin.id, visible: false }),
    },
    {
      label: `${plugin.label} Settings`,
      icon: SettingsIcon,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => openRef(getDesignated('settings'), [
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
