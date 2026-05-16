<script setup lang="ts">
import WebApp from './WebApp.vue';
import ApiStatus from './core/components/ApiStatus.vue';
import Onboarding from './core/components/onboarding/Onboarding.vue';
import { ref } from 'vue';
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue';

const isOnboarding = useSelector(applicationState, (s) => s.hasTag('onboarding'));
const isConnecting = useSelector(applicationState, (s) => s.hasTag('connecting'));

// Toggle for showing API status (can be toggled with a hotkey)
const showApiStatus = ref(false);

// Listen for keyboard shortcut to toggle API status
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    showApiStatus.value = !showApiStatus.value;
  }
});
</script>

<template>
  <!-- Onboarding modal overlay -->
  <Onboarding v-if="isOnboarding" />
  <!-- Main web app component (always rendered, plugins show own loading states) -->
  <WebApp />

  <!-- Loading overlay while waiting for backend connection -->
  <Transition name="fade">
    <div v-if="isConnecting" class="loading-overlay" />
  </Transition>

  <!-- Floating API status overlay (toggle with Ctrl+Shift+A) -->
  <div v-if="showApiStatus" class="api-status-overlay">
    <button @click="showApiStatus = false" class="close-btn">×</button>
    <ApiStatus />
  </div>
</template>

<style>
/* Import web app styles */
@import './style.css';

/* API status overlay styles */
.api-status-overlay {
  position: fixed;
  top: 20px;
  right: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  max-width: 400px;
  padding: 20px;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f0f0f0;
}

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
