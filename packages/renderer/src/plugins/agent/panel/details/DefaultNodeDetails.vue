<template>
  <div class="default-node-details">
    <div class="detail-section">
      <h4 class="detail-label">Node Attributes</h4>
      <div v-if="hasNodeAttributes" class="detail-content">
        <DataRenderer :data="nodeAttributes" :default-expanded="false" />
      </div>
      <div v-else class="empty-state">
        <p class="empty-text">No input parameters available</p>
      </div>
    </div>

    <div v-if="hasOutput" class="detail-section">
      <h4 class="detail-label">Output Result</h4>
      <div class="detail-content">
        <DataRenderer :data="outputResult" :default-expanded="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TNodeEntity } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

// Separate input parameters from output result
const nodeAttributes = computed(() => {
  const params: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props.nodeAttributes)) {
    // Exclude result as it's shown in output section
    if (key !== 'result') {
      params[key] = value;
    }
  }
  
  return params;
});

const outputResult = computed(() => props.nodeAttributes.result);

const hasNodeAttributes = computed(() => Object.keys(nodeAttributes.value).length > 0);
const hasOutput = computed(() => outputResult.value !== undefined);
</script>

<style scoped>
.default-node-details {
  font-size: 0.75rem;
}

.detail-section {
  margin-bottom: 0;
}

.detail-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.detail-content {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
  padding: 0.75rem;
}

.detail-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e5e7eb;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 0.6875rem;
  line-height: 1.5;
  padding-right: 2rem; /* Space for copy button */
}

.copy-button {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
}

.empty-state {
  padding: 1rem;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
}

.empty-text {
  color: #6b7280;
  font-size: 0.75rem;
}
</style>