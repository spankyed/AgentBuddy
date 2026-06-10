<template>
  <div class="relative flex flex-col h-full bg-neutral-900">
    <!-- Passkey toast: positioned over the nav bar (the WebContentsView covers the content area) -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-300"
      leave-to-class="opacity-0"
    >
      <div
        v-if="passkeyToast"
        class="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs shadow-lg pointer-events-none"
      >
        {{ passkeyToast }}
      </div>
    </Transition>
    <BrowserTabBar
      :tabs="tabs"
      :activeTabId="activeTabId"
      :tabGroups="tabGroups"
      @select="actor.send({ type: 'TAB.SELECT', tabId: $event })"
      @close="actor.send({ type: 'TAB.CLOSE', tabId: $event })"
      @create="actor.send({ type: 'TAB.CREATE' })"
      @duplicate="actor.send({ type: 'TAB.DUPLICATE', tabId: $event })"
      @close-others="actor.send({ type: 'TAB.CLOSE_OTHERS', tabId: $event })"
      @toggle-mute="actor.send({ type: 'TAB.TOGGLE_MUTE', tabId: $event })"
      @create-group="actor.send({ type: 'GROUP.CREATE', ...$event })"
      @rename-group="actor.send({ type: 'GROUP.RENAME', ...$event })"
      @change-group-color="actor.send({ type: 'GROUP.CHANGE_COLOR', ...$event })"
      @delete-group="actor.send({ type: 'GROUP.DELETE', ...$event })"
      @toggle-group-collapse="actor.send({ type: 'GROUP.TOGGLE_COLLAPSE', groupId: $event })"
      @add-to-group="actor.send({ type: 'TAB.ADD_TO_GROUP', ...$event })"
      @remove-from-group="actor.send({ type: 'TAB.REMOVE_FROM_GROUP', tabId: $event })"
    />
    <BrowserNavBar
      ref="navBar"
      :addressBarValue="addressBarValue"
      :canGoBack="activeTab?.canGoBack ?? false"
      :canGoForward="activeTab?.canGoForward ?? false"
      :isLoading="activeTab?.isLoading ?? false"
      :suggestions="suggestions"
      :selectedSuggestionIndex="selectedSuggestionIndex"
      :inlineCompletion="inlineCompletion"
      :isBookmarked="isBookmarked"
      :bookmarks="bookmarks"
      @toggle-bookmark="actor.send({ type: 'BOOKMARK.TOGGLE' })"
      @bookmark-navigate="actor.send({ type: 'BOOKMARK.NAVIGATE', url: $event })"
      @bookmark-remove="actor.send({ type: 'BOOKMARK.REMOVE', url: $event })"
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
      @autocomplete:select="actor.send({ type: 'AUTOCOMPLETE.SELECT', index: $event })"
      @autocomplete:dismiss="actor.send({ type: 'AUTOCOMPLETE.DISMISS' })"
      @autocomplete:accept-inline="actor.send({ type: 'AUTOCOMPLETE.ACCEPT_INLINE' })"
    />

    <BrowserBookmarkBar
      v-if="bookmarks.length > 0 && showBookmarksBar"
      :bookmarks="bookmarks"
      @navigate="actor.send({ type: 'BOOKMARK.NAVIGATE', url: $event })"
      @remove="actor.send({ type: 'BOOKMARK.REMOVE', url: $event })"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { isAnyMenuOpen } from '@/core/composables/useMenuState';
import { useSelector } from '@xstate/vue';
import { applicationState } from '@/main';
import { id, type BrowserState } from './state.ts';
import BrowserTabBar from './components/BrowserTabBar.vue';
import BrowserNavBar from './components/BrowserNavBar.vue';
import BrowserBookmarkBar from './components/BrowserBookmarkBar.vue';

const actor: BrowserState = applicationState.system.get(id);
const settingsActor = applicationState.system.get('settings');
const showBookmarksBar = useSelector(settingsActor, (state: any) => state.context.settings?.plugins?.browser?.showBookmarksBar ?? true);

const tabs = useSelector(actor, s => s.context.tabs);
const activeTabId = useSelector(actor, s => s.context.activeTabId);
const addressBarValue = useSelector(actor, s => s.context.addressBarValue);
const suggestions = useSelector(actor, s => s.context.suggestions);
const selectedSuggestionIndex = useSelector(actor, s => s.context.selectedSuggestionIndex);
const inlineCompletion = useSelector(actor, s => s.context.inlineCompletion);
const tabGroups = useSelector(actor, s => s.context.tabGroups);
const bookmarks = useSelector(actor, s => s.context.bookmarks);
const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? null);
const isBookmarked = computed(() => {
  const tab = activeTab.value;
  if (!tab?.url) return false;
  return bookmarks.value.some(b => b.url === tab.url);
});

// Hide browser overlay when any app menu is open (toolbar, canvas header, tab context menu, etc.)
watch(isAnyMenuOpen, (menuOpen) => {
  if (menuOpen) {
    window.electronAPI?.browser.hide();
  } else {
    window.electronAPI?.browser.show();
  }
});

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
    case 'd':
      e.preventDefault();
      actor.send({ type: 'BOOKMARK.TOGGLE' });
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

let unsubFocusAddressBar: (() => void) | null = null;
let unsubPasskeyEvent: (() => void) | null = null;

const passkeyToast = ref<string | null>(null);
let passkeyToastTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);

  // Listen for Cmd+L from the WebContentsView (main process forwards it)
  unsubFocusAddressBar = window.electronAPI?.browser.onFocusAddressBar(() => {
    navBar.value?.focusAddressBar();
  }) ?? null;

  // Passkey created/used notifications (virtual authenticator approves silently)
  unsubPasskeyEvent = window.electronAPI?.browser.onPasskeyEvent(({ kind, rpId }) => {
    passkeyToast.value = kind === 'created'
      ? `Passkey created for ${rpId}`
      : `Signed in with passkey for ${rpId}`;
    if (passkeyToastTimer) clearTimeout(passkeyToastTimer);
    passkeyToastTimer = setTimeout(() => { passkeyToast.value = null; }, 4000);
  }) ?? null;

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
      // Load the active tab on first open (lazy tabs don't load until selected)
      window.electronAPI?.browser.loadTab(activeId);
    }
  } else {
    actor.send({ type: 'TAB.CREATE' });
  }
});

onUnmounted(() => {
  mounted = false;
  window.removeEventListener('keydown', handleKeydown);
  unsubFocusAddressBar?.();
  unsubPasskeyEvent?.();
  if (passkeyToastTimer) clearTimeout(passkeyToastTimer);
  window.electronAPI?.browser.hide();

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>
