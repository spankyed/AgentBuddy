<template>
  <div class="misc">
    <h2>Miscellaneous Settings</h2>
    <p class="description">
      Additional settings and configurations will be available here in future updates.
    </p>
    
    <div class="empty-state">
      <Settings class="empty-icon" />
      <p>No additional settings available yet</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Settings } from 'lucide-vue-next'
</script>

<style scoped>
.misc {
  max-width: 600px;
}

h2 {
  margin-bottom: 1rem;
  color: var(--color-heading);
}

.description {
  margin-bottom: 2rem;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  background: var(--color-background-soft);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 1rem;
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}
</style>