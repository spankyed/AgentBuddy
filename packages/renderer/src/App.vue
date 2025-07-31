<script setup lang="ts">
import WebApp from './WebApp.vue';
import ApiStatus from './components/ApiStatus.vue';
import { ref } from 'vue';

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
  <!-- Main web app -->
  <WebApp />
  
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
</style>
