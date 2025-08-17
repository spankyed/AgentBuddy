<template>
  <div class="max-w-md">
    <h2 class="text-xl font-semibold text-white mb-2">Miscellaneous Settings</h2>
    <p class="text-sm text-neutral-400 mb-6">
      Additional settings and configurations will be available here in future updates.
    </p>
    
    <div class="py-12 text-center bg-neutral-800/50 border border-dashed border-neutral-700 rounded-lg">
      <Settings class="w-12 h-12 mx-auto mb-3 text-neutral-600" />
      <p class="text-sm text-neutral-500">No additional settings available yet</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Settings } from 'lucide-vue-next'
</script>

.misc {
  max-width: 500px;
}

h2 {
  margin: 0 0 1rem 0;
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.description {
  margin-bottom: 2rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  line-height: 1.6;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 1rem;
  color: rgba(255, 255, 255, 0.2);
  opacity: 1;
}

.empty-state p {
  margin: 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}
