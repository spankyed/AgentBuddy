<script setup lang="ts">
import ApiStatus from './components/ApiStatus.vue';
</script>

<template>
  <div class="app">
    <h1>Electron + Vue + tRPC API</h1>
    <p>
      Your Electron app with integrated WebSocket API server
    </p>
    
    <ApiStatus />
    
    <div class="info">
      <p>
        Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> for Vue documentation
      </p>
      <p>
        Visit <a href="https://trpc.io/" target="_blank" rel="noopener">trpc.io</a> for tRPC documentation
      </p>
    </div>
  </div>
</template>

<style scoped>
.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  color: #333;
  margin-bottom: 10px;
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

a {
  color: #2196f3;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
</style>
