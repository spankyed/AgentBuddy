<template>
  <div v-if="!isMac" class="window-controls">
    <button
      @click="minimize"
      class="control-button"
      title="Minimize"
    >
      <svg width="8" height="1" viewBox="0 0 8 1">
        <rect width="8" height="1" fill="currentColor" />
      </svg>
    </button>
    <button
      @click="maximize"
      class="control-button"
      title="Maximize"
    >
      <svg width="8" height="8" viewBox="0 0 8 8">
        <rect width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button
      @click="close"
      class="control-button close"
      title="Close"
    >
      <svg width="8" height="8" viewBox="0 0 8 8">
        <path d="M0 0 L8 8 M8 0 L0 8" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const isMac = computed(() => {
  return navigator.platform.toLowerCase().includes('mac');
});

const minimize = () => {
  if (window.electronAPI?.windowControls) {
    window.electronAPI.windowControls.minimize();
  }
};

const maximize = () => {
  if (window.electronAPI?.windowControls) {
    window.electronAPI.windowControls.maximize();
  }
};

const close = () => {
  if (window.electronAPI?.windowControls) {
    window.electronAPI.windowControls.close();
  }
};
</script>

<style scoped>
.window-controls {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 100%;
}

.control-button {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: #777;
  transition: all 0.15s ease;
  cursor: pointer;
}

.control-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.control-button.close:hover {
  background: #e81123;
  color: #fff;
}

.control-button svg {
  pointer-events: none;
}
</style>
