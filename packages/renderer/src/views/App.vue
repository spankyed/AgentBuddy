<script setup lang="ts">
import WebApp from './WebApp.vue';
import PluginPopoutApp from './PluginPopoutApp.vue';
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue';
import { onScopeDispose, shallowRef } from 'vue';
import { fePacks } from '@/runtime/packs';

// Followed rather than read once, because this window mounts before any pack's frontend has loaded — no pack
// is registered in `main.ts`, the shell loads every one, the app's own included, once the bus says which packs
// are running. And the slot is drawn during onboarding, which is exactly that window, so a pack contributing
// the welcome screen would otherwise have nothing drawn for it on the one boot it is meant for.
const WelcomeComponent = shallowRef(fePacks.getAppExtension('welcome'));
onScopeDispose(fePacks.onRegisteredPacksChanged(() => {
  WelcomeComponent.value = fePacks.getAppExtension('welcome');
}));
const isWelcome = useSelector(applicationState, (s) => s.hasTag('welcome'));
const isConnecting = useSelector(applicationState, (s) => s.hasTag('connecting'));
const isPluginPopout = new URLSearchParams(window.location.search).get('popout') === 'plugin';
</script>

<template>
  <!-- Welcome modal overlay (first-time users) -->
  <component v-if="isWelcome && !isPluginPopout && WelcomeComponent" :is="WelcomeComponent" />
  <!-- Main web app component (always rendered, plugins show own loading states) -->
  <PluginPopoutApp v-if="isPluginPopout" />
  <WebApp v-else />

  <!-- Loading overlay while waiting for backend connection -->
  <Transition name="fade">
    <div v-if="isConnecting" class="loading-overlay" />
  </Transition>
</template>

<style>
/* Import web app styles */
@import '../style.css';

/* Loading overlay */
.loading-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(23 23 23 / 0.85);
  z-index: 9998;
}
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-leave-to {
  opacity: 0;
}
</style>
