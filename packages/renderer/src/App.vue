<script setup lang="ts">
import { onMounted } from 'vue';
import UserProfile from './components/UserProfile.vue';
import { api, events } from '@app/preload';

// Test the typed API
onMounted(async () => {
  // Get app config
  const config = await api.getAppConfig();
  console.log('App config:', config);
  
  // Listen for theme changes
  const unsubscribe = events.onThemeChanged(({ theme }) => {
    console.log('Theme changed to:', theme);
    document.body.className = theme;
  });
  
  // Clean up on unmount
  return () => unsubscribe();
});
</script>

<template>
  <div class="app">
    <h1>Electron + Vue 3 + Vite + TypeScript!</h1>
    <p>
      With shared types across main, preload, and renderer!
    </p>
    
    <UserProfile />
    
    <div class="info">
      <p>
        Edit any file to test Hot Module Replacement.
      </p>
      <p>
        Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> for Vue documentation
      </p>
    </div>
  </div>
</template>

<style scoped>
.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.info {
  margin-top: 40px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

.info p {
  margin: 10px 0;
}
</style>
