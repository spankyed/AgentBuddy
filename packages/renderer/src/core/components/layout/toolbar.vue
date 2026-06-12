<template>
  <div class="toolbar flex flex-col flex-shrink-0 h-full text-white border-r border-neutral-800" data-onboarding-id="toolbar" :style="toolbarZoomStyle" @contextmenu.prevent="onContextMenu">
    <!-- Window controls area (macOS traffic lights / Windows buttons) -->
    <div class="window-controls-area flex-shrink-0 flex items-center justify-center border-b border-neutral-800" :style="controlsAreaStyle">
      <WindowControls v-if="!isMac" />
    </div>

    <div class="flex flex-col min-h-0 flex-1">
      <!-- Scrollable section -->
      <div class="flex-1 overflow-y-auto scrollbar-hide my-2">
        <div class="flex flex-col items-center space-y-6">
          <button
            v-for="item in pluginItems"
            :key="item.id"
            :data-onboarding-id="`plugin-${item.id}`"
            :class="[
              'p-2 rounded-lg transition-all duration-200 ease-in-out',
              activePlugin.id === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700'
            ]"
            @click="onPluginClick($event, item)"
            @contextmenu.stop.prevent="onPluginContextMenu($event, item)"
            :title="item.label"
          >
            <component :is="item.icon" :size="24" />
          </button>
        </div>
      </div>

      <!-- Pinned bottom section -->
      <div class="flex flex-col items-center py-6 mt-auto space-y-6 border-t border-neutral-800">
        <button
          v-for="item in pinnedItems"
          :key="item.id"
          :data-onboarding-id="`plugin-${item.id}`"
          :class="[
            'p-2 rounded-lg transition-all duration-200 ease-in-out',
            activePlugin.id === item.id
              ? 'bg-primary-600 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-primary-700'
          ]"
          @click="onPluginClick($event, item)"
          @contextmenu.stop.prevent="onPluginContextMenu($event, item)"
          :title="item.label"
        >
          <component :is="item.icon" :size="24" />
        </button>
      </div>
    </div>

    <!-- DEV badge at very bottom -->
    <div v-if="isDev" class="flex items-center justify-center pt-1 pb-3 mb-3">
      <span class="px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded">
        DEV
      </span>
    </div>

    <ContextMenuPopup :show="showMenu" :pos="menuPos" :items="visibilityMenuItems" :separator-after="separatorIndex" @close="showMenu = false" />
    <ToolbarPluginContextMenu ref="pluginContextMenu" />
  </div>
</template>

<script setup lang="ts">
import type { Plugin } from '@/core/types';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useSelector } from '@xstate/vue';
import WindowControls from './WindowControls.vue';
import ToolbarPluginContextMenu from './ToolbarPluginContextMenu.vue';
import ContextMenuPopup from '@/core/components/design/ContextMenuPopup.vue';
import { useContextMenu, type MenuItem } from '@/core/composables/useContextMenu';
import { useSettingsSaveStatus } from '@/core/composables/useSettingsSaveStatus';
import { applicationState } from '@/main';
import allPlugins from '@/plugins';

const emit = defineEmits<(e: 'select-plugin', id: string) => void>();

const props = defineProps<{
  activePlugin: Plugin;
  plugins: Plugin[];
}>();

const pluginItems = computed(() => props.plugins.filter((item) => !item.isPinned));
const pinnedItems = computed(() => props.plugins.filter((item) => item.isPinned));

// --- Right-click menu: toggle plugin visibility ---
const { showMenu, menuPos, open } = useContextMenu();
const { updateSettings } = useSettingsSaveStatus();
const pluginContextMenu = ref<InstanceType<typeof ToolbarPluginContextMenu> | null>(null);
const pluginVisibility = useSelector(
  applicationState,
  (state) => state.context.pluginVisibility,
);

const isVisible = (id: string) => pluginVisibility.value?.[id] !== false;

const togglePluginVisibility = (id: string) => {
  if (id === 'settings') return; // Settings plugin cannot be hidden
  updateSettings({
    entityType: 'plugin',
    label: '_meta',
    path: ['visibility', id],
    value: !isVisible(id),
  });
};

const nonPinnedPlugins = allPlugins.filter(p => p.icon && !p.isPinned);
const pinnedPlugins = allPlugins.filter(p => p.icon && p.isPinned);
const sortedPlugins = [...nonPinnedPlugins, ...pinnedPlugins];

const visibilityMenuItems = computed<MenuItem[]>(() =>
  sortedPlugins.map((plugin) => {
    const locked = plugin.id === 'settings';
    const visible = isVisible(plugin.id);
    const textClass = locked
      ? 'text-neutral-600 cursor-not-allowed'
      : visible
        ? 'text-neutral-200'
        : 'text-neutral-500';
    return {
      label: plugin.label,
      icon: plugin.icon!,
      class: textClass,
      iconClass: textClass,
      action: () => togglePluginVisibility(plugin.id),
      keepOpen: true,
    };
  }),
);

const separatorIndex = nonPinnedPlugins.length > 0 && pinnedPlugins.length > 0
  ? nonPinnedPlugins.length - 1
  : -1;

const onContextMenu = (e: MouseEvent) => {
  open(e, visibilityMenuItems.value.length + (separatorIndex >= 0 ? 1 : 0));
};

const onPluginContextMenu = (e: MouseEvent, plugin: Plugin) => {
  pluginContextMenu.value?.open(e, plugin);
};

const onPluginClick = (e: MouseEvent, plugin: Plugin) => {
  if (e.metaKey) {
    window.electronAPI?.plugins?.popout(plugin.id, plugin.label);
    return;
  }

  emit('select-plugin', plugin.id);
};

const isDev = import.meta.env.DEV;

const isMac = computed(() => {
  return navigator.platform.toLowerCase().includes('mac');
});

// Counter-zoom the toolbar so macOS traffic lights stay aligned at any page zoom level
const zoomFactor = ref(1);
const updateZoomFactor = () => {
  zoomFactor.value = window.electronAPI?.zoom?.getZoomFactor() ?? 1;
  window.electronAPI?.zoom?.notifyZoomChanged?.(zoomFactor.value);
};
const toolbarZoomStyle = computed(() =>
  zoomFactor.value === 1 ? {} : { zoom: 1 / zoomFactor.value },
);
const controlsAreaStyle = computed(() => ({
  height: `${42 * zoomFactor.value}px`,
}));

onMounted(() => {
  updateZoomFactor();
  window.addEventListener('resize', updateZoomFactor);
});
onUnmounted(() => window.removeEventListener('resize', updateZoomFactor));
</script>

<style lang="scss">
.toolbar {
  --toolbar-width: 4.5rem; /* 72px - default width */
  width: var(--toolbar-width);
  min-width: var(--toolbar-width);
  flex-shrink: 0;
}

.window-controls-area {
  -webkit-app-region: drag;
  user-select: none;
}

/* Ensure buttons in toolbar are not draggable */
button {
  -webkit-app-region: no-drag;
}

.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}
</style>
