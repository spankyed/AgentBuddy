<template>
  <div class="listen-node-details">
    <div v-if="hasInputParams" class="detail-section">
      <h4 class="detail-label">Input Parameters</h4>
      <div class="detail-content">
        <DataRenderer :data="inputParams" :default-expanded="true" />
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

const inputParams = computed(() => {
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

const hasInputParams = computed(() => Object.keys(inputParams.value).length > 0);
const hasOutput = computed(() => outputResult.value !== undefined);
</script>

<style scoped>
.listen-node-details {
  font-size: 0.75rem;
}

.detail-section {
  margin-bottom: 1rem;
}

.detail-section:last-child {
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

.detail-grid {
  display: grid;
  gap: 0.5rem;
}

.detail-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.detail-key {
  color: #6b7280;
  flex-shrink: 0;
}

.detail-value {
  color: #e5e7eb;
  word-break: break-word;
}

.mode-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;
}

.mode-entry {
  background: rgba(34, 197, 94, 0.1);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.mode-internal {
  background: rgba(59, 130, 246, 0.1);
  color: #93bbfe;
  border: 1px solid rgba(59, 130, 246, 0.2);
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
}
</style>