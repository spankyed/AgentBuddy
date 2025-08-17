<template>
  <div v-if="!isMac" class="window-controls flex items-center">
    <button
      @click="minimize"
      class="control-button minimize"
      title="Minimize"
    >
      <svg width="10" height="1" viewBox="0 0 10 1">
        <rect width="10" height="1" fill="currentColor" />
      </svg>
    </button>
    <button
      @click="maximize"
      class="control-button maximize"
      title="Maximize"
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button
      @click="close"
      class="control-button close"
      title="Close"
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" stroke-width="1" />
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
  height: 100%;
  margin-left: auto;
}

.control-button {
  width: 46px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #999;
  transition: all 0.1s ease;
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