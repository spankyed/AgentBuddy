<template>
  <ContextMenuPopup
    :show="showMenu"
    :pos="menuPos"
    :items="menuItems"
    :label="selectedSurface?.label"
    @close="showMenu = false"
  />
</template>

<script setup lang="ts">
import { useContextualHelp } from '@/views/settings/contextual-help';
import { computed, ref } from 'vue';
import { CircleHelp, ExternalLink, EyeOff, Settings as SettingsIcon } from 'lucide-vue-next';
import type { Surface } from '@/types';
import ContextMenuPopup from '@apackdev/ui/design/ContextMenuPopup';
import { useShell, untypedOpenSurface } from '@apackdev/sdk/fe';
import { HOST } from '@apackdev/host/fe';
import { useContextMenu, type MenuItem } from '@apackdev/ui/composables/useContextMenu';

const { showMenu, menuPos, open: openMenu } = useContextMenu();
const shell = useShell();
const { hasHelp, openFeatureHelp } = useContextualHelp();
const selectedSurface = ref<Pick<Surface, 'id' | 'label'> | null>(null);

const menuItems = computed<MenuItem[]>(() => {
  const surface = selectedSurface.value;
  if (!surface) return [];

  if (surface.id === HOST.settings) {
    return [
      {
        label: 'Pop Out',
        icon: ExternalLink,
        class: 'text-neutral-200',
        iconClass: 'text-neutral-500',
        action: () => window.electronAPI?.surfaces?.popout(surface.id, surface.label),
      },
    ];
  }

  return [
    ...(hasHelp(surface.id) ? [{ label: `${surface.label} Help`, icon: CircleHelp, class: 'text-neutral-200', iconClass: 'text-neutral-500', action: () => openFeatureHelp(surface.id) }] : []),
    {
      label: 'Pop Out',
      icon: ExternalLink,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => window.electronAPI?.surfaces?.popout(surface.id, surface.label),
    },
    {
      label: `Hide ${surface.label}`,
      icon: EyeOff,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => shell.setPluginVisible(surface.id, false),
    },
    {
      label: `${surface.label} Settings`,
      icon: SettingsIcon,
      class: 'text-neutral-200',
      iconClass: 'text-neutral-500',
      action: () => untypedOpenSurface(HOST.settings, [
        { type: 'TAB.SELECT', tab: 'features' },
        { type: 'FEATURE.SELECT', featureId: surface.id },
      ]),
    },
  ];
});

const open = (event: MouseEvent, surface: Pick<Surface, 'id' | 'label'>) => {
  selectedSurface.value = surface;
  openMenu(event, menuItems.value.length, surface.label ? 32 : 0);
};

defineExpose({ open });
</script>
