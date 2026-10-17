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
import { useContextualHelp } from '@/views/settings/contextual-help';
import { computed, ref } from 'vue';
import { CircleHelp, ExternalLink, EyeOff, Settings as SettingsIcon } from 'lucide-vue-next';
import type { Plugin } from '@/types';
import ContextMenuPopup from '@apackdev/ui/design/ContextMenuPopup';
import { useShell, untypedOpenPlugin } from '@apackdev/sdk/fe';
import { HOST } from '@apackdev/host/fe';
import { useContextMenu, type MenuItem } from '@apackdev/ui/composables/useContextMenu';

const { showMenu, menuPos, open: openMenu } = useContextMenu();
const shell = useShell();
const { hasHelp, openFeatureHelp } = useContextualHelp();
const selectedPlugin = ref<Pick<Plugin, 'id' | 'label'> | null>(null);

const menuItems = computed<MenuItem[]>(() => {
  const plugin = selectedPlugin.value;
  if (!plugin) return [];

  if (plugin.id === HOST.settings) {
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
    ...(hasHelp(plugin.id) ? [{ label: `${plugin.label} Help`, icon: CircleHelp, class: 'text-neutral-200', iconClass: 'text-neutral-500', action: () => openFeatureHelp(plugin.id) }] : []),
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
      action: () => shell.setPluginVisible(plugin.id, false),
    },
    {
      label: `${plugin.label} Settings`,
      icon: SettingsIcon,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => untypedOpenPlugin(HOST.settings, [
        { type: 'TAB.SELECT', tab: 'features' },
        { type: 'FEATURE.SELECT', featureId: plugin.id },
      ]),
    },
  ];
});

const open = (event: MouseEvent, plugin: Pick<Plugin, 'id' | 'label'>) => {
  selectedPlugin.value = plugin;
  openMenu(event, menuItems.value.length, plugin.label ? 32 : 0);
};

defineExpose({ open });
</script>
