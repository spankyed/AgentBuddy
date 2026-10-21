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
            v-for="item in surfaceItems"
            :key="item.id"
            :data-onboarding-id="`surface-${item.id}`"
            :class="[
              'p-2 rounded-lg transition-all duration-200 ease-in-out', item.loaded ? '' : 'opacity-50',
              activeSurface.id === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700'
            ]"
            @click="onSurfaceClick($event, item)"
            @contextmenu.stop.prevent="onSurfaceContextMenu($event, item)"
            :title="item.loaded ? item.label : `${item.label} (not loaded yet)`"
          >
            <component :is="item.icon ?? Puzzle" :size="24" />
          </button>
        </div>
      </div>

      <!-- Pinned bottom section -->
      <div class="flex flex-col items-center py-6 mt-auto space-y-6 border-t border-neutral-800">
        <button
          v-for="item in pinnedItems"
          :key="item.id"
          :data-onboarding-id="`surface-${item.id}`"
          :class="[
            'p-2 rounded-lg transition-all duration-200 ease-in-out', item.loaded ? '' : 'opacity-50',
            activeSurface.id === item.id
              ? 'bg-primary-600 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-primary-700'
          ]"
          @click="onSurfaceClick($event, item)"
          @contextmenu.stop.prevent="onSurfaceContextMenu($event, item)"
          :title="item.loaded ? item.label : `${item.label} (not loaded yet)`"
        >
          <component :is="item.icon ?? Puzzle" :size="24" />
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
    <ToolbarSurfaceContextMenu ref="surfaceContextMenu" />
  </div>
</template>

<script setup lang="ts">
import type { Surface } from '@/types';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import WindowControls from './WindowControls.vue';
import ToolbarSurfaceContextMenu from './ToolbarSurfaceContextMenu.vue';
import ContextMenuPopup from '@apackdev/ui/design/ContextMenuPopup';
import { HOST, type SurfaceNavigationItem } from '@apackdev/host/fe';
import { Puzzle } from 'lucide-vue-next';
import { useContextMenu, type MenuItem } from '@apackdev/ui/composables/useContextMenu';
import { applicationState } from '@/main';

const emit = defineEmits<{ 'select-surface': [id: string]; 'open-surface': [id: string] }>();

const props = defineProps<{
  activeSurface: Surface;
  surfaces: SurfaceNavigationItem[];
}>();

const surfaceItems = computed(() => props.surfaces.filter((item) => item.visible && !item.isPinned));
const pinnedItems = computed(() => props.surfaces.filter((item) => item.visible && item.isPinned));

// --- Right-click menu: toggle surface visibility ---
const { showMenu, menuPos, open } = useContextMenu();
const surfaceContextMenu = ref<InstanceType<typeof ToolbarSurfaceContextMenu> | null>(null);

const isVisible = (id: string) => props.surfaces.find(surface => surface.id === id)?.visible ?? false;

const togglePluginVisibility = (id: string) => {
  if (id === HOST.settings) return;
  applicationState.send({ type: 'SET_SURFACE_VISIBILITY', surface: id, visible: !isVisible(id) });
};

const visibilityMenuItems = computed<MenuItem[]>(() =>
  props.surfaces.map((surface) => {
    const locked = surface.id === HOST.settings;
    const visible = isVisible(surface.id);
    const textClass = locked
      ? 'text-neutral-600 cursor-not-allowed'
      : visible
        ? 'text-neutral-200'
        : 'text-neutral-500';
    return {
      label: surface.label,
      icon: surface.icon ?? Puzzle,
      class: textClass,
      iconClass: textClass,
      action: () => togglePluginVisibility(surface.id),
      keepOpen: true,
    };
  }),
);

const separatorIndex = computed(() => {
  const firstPinned = props.surfaces.findIndex(surface => surface.isPinned);
  return firstPinned > 0 ? firstPinned - 1 : -1;
});

const onContextMenu = (e: MouseEvent) => {
  open(e, visibilityMenuItems.value.length + (separatorIndex.value >= 0 ? 1 : 0));
};

const onSurfaceContextMenu = (e: MouseEvent, surface: SurfaceNavigationItem) => {
  surfaceContextMenu.value?.open(e, surface);
};

const onSurfaceClick = (e: MouseEvent, surface: SurfaceNavigationItem) => {
  if (e.metaKey) {
    window.electronAPI?.surfaces?.popout(surface.id, surface.label);
    return;
  }

  // An unloaded tab opens through the shell, which waits for its pack or says why it can't
  if (surface.loaded) emit('select-surface', surface.id);
  else emit('open-surface', surface.id);
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
