<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <BrowserTabBar
      :tabs="tabs"
      :activeTabId="activeTabId"
      @select="actor.send({ type: 'TAB.SELECT', tabId: $event })"
      @close="actor.send({ type: 'TAB.CLOSE', tabId: $event })"
      @create="actor.send({ type: 'TAB.CREATE' })"
      @duplicate="actor.send({ type: 'TAB.DUPLICATE', tabId: $event })"
      @close-others="actor.send({ type: 'TAB.CLOSE_OTHERS', tabId: $event })"
      @toggle-mute="actor.send({ type: 'TAB.TOGGLE_MUTE', tabId: $event })"
    />
    <BrowserNavBar
      ref="navBar"
      :addressBarValue="addressBarValue"
      :canGoBack="activeTab?.canGoBack ?? false"
      :canGoForward="activeTab?.canGoForward ?? false"
      :isLoading="activeTab?.isLoading ?? false"
      @back="actor.send({ type: 'NAV.BACK' })"
      @forward="actor.send({ type: 'NAV.FORWARD' })"
      @reload="actor.send({ type: 'NAV.RELOAD' })"
      @stop="actor.send({ type: 'NAV.STOP' })"
      @navigate="actor.send({ type: 'NAV.GO', url: $event })"
      @update:addressBarValue="actor.send({ type: 'ADDRESS_BAR.UPDATE', value: $event })"
      @focus="actor.send({ type: 'ADDRESS_BAR.FOCUS' })"
      @blur="actor.send({ type: 'ADDRESS_BAR.BLUR' })"
      @toggle-devtools="toggleDevTools"
      @open-in-new-tab="actor.send({ type: 'TAB.CREATE', url: $event })"
    />

    <!-- Content placeholder: WebContentsView is overlaid here by the main process -->
    <div
      ref="contentArea"
      class="flex-1 bg-neutral-950 overflow-hidden"
    >
      <div v-if="tabs.length === 0" class="flex flex-col items-center justify-center h-full text-neutral-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-4 text-neutral-600"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <p class="text-sm">Click + to open a new tab</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSelector } from '@xstate/vue';
import { applicationState } from '@/main';
import { id, type BrowserState } from './state.ts';
import BrowserTabBar from './components/BrowserTabBar.vue';
import BrowserNavBar from './components/BrowserNavBar.vue';

const actor: BrowserState = applicationState.system.get(id);

const tabs = useSelector(actor, s => s.context.tabs);
const activeTabId = useSelector(actor, s => s.context.activeTabId);
const addressBarValue = useSelector(actor, s => s.context.addressBarValue);
const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? null);

const navBar = ref<InstanceType<typeof BrowserNavBar> | null>(null);
function toggleDevTools() {
  if (activeTabId.value !== null) {
    window.electronAPI?.browser.toggleDevTools(activeTabId.value);
  }
}

const contentArea = ref<HTMLDivElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let mounted = true;

function handleKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  switch (e.key) {
    case 't':
      e.preventDefault();
      actor.send({ type: 'TAB.CREATE' });
      break;
    case 'w':
      e.preventDefault();
      if (activeTabId.value !== null) {
        actor.send({ type: 'TAB.CLOSE', tabId: activeTabId.value });
      }
      break;
    case 'l':
      e.preventDefault();
      navBar.value?.focusAddressBar();
      break;
    case 'r':
      e.preventDefault();
      actor.send({ type: 'NAV.RELOAD' });
      break;
  }
}

function reportBounds() {
  if (!contentArea.value) return;
  const rect = contentArea.value.getBoundingClientRect();
  const zoom = window.electronAPI?.zoom.getZoomFactor() ?? 1;
  window.electronAPI?.browser.setBounds({
    x: Math.round(rect.x * zoom),
    y: Math.round(rect.y * zoom),
    width: Math.round(rect.width * zoom),
    height: Math.round(rect.height * zoom),
  });
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);

  // Report bounds first so the overlay appears at the correct position
  reportBounds();
  window.electronAPI?.browser.show();

  // Watch for size changes
  resizeObserver = new ResizeObserver(reportBounds);
  if (contentArea.value) {
    resizeObserver.observe(contentArea.value);
  }

  // Sync existing tabs from main process (e.g. popup-created tabs while on another plugin)
  const existingTabs = await window.electronAPI?.browser.getTabs();
  const activeId = await window.electronAPI?.browser.getActiveTab();
  if (!mounted) return;

  if (existingTabs?.length) {
    for (const tab of existingTabs) {
      actor.send({ type: 'IPC.TAB_CREATED', tab });
    }
    if (activeId != null) {
      actor.send({ type: 'IPC.ACTIVE_TAB_CHANGED', tabId: activeId });
    }
  } else {
    actor.send({ type: 'TAB.CREATE' });
  }
});

onUnmounted(() => {
  mounted = false;
  window.removeEventListener('keydown', handleKeydown);
  window.electronAPI?.browser.hide();

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>
