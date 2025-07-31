<template>
  <div class="action-node-details">
    <div class="detail-section">
      <h4 class="detail-label">Action Configuration</h4>
      <div class="detail-grid">
        <div v-if="nodeAttributes.actionId" class="detail-item">
          <span class="detail-key">Action ID:</span>
          <span class="detail-value">{{ nodeAttributes.actionId }}</span>
        </div>
        <div v-if="nodeAttributes.actionName" class="detail-item">
          <span class="detail-key">Action Name:</span>
          <span class="detail-value">{{ nodeAttributes.actionName }}</span>
        </div>
      </div>
    </div>
<!-- 
    <div v-if="hasParameters" class="detail-section">
      <h4 class="detail-label">Parameters</h4>
      <div class="detail-content">
        <pre class="detail-pre">{{ JSON.stringify(parameters, null, 2) }}</pre>
        <button @click="copyToClipboard(JSON.stringify(parameters, null, 2))" class="copy-button">
          <Copy class="w-3 h-3" />
        </button>
      </div>
    </div> -->

    <div v-if="hasResolvedParams" class="detail-section">
      <h4 class="detail-label">Resolved Parameters</h4>
      <div class="detail-grid">
        <div v-for="(value, key) in resolvedParams" :key="key" class="detail-item">
          <span class="detail-key">{{ key }}:</span>
          <span class="detail-value">{{ formatValue(value) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Copy } from 'lucide-vue-next';
import type { TNodeEntity } from '@abuddy/api';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

// Extract direct parameters
const parameters = computed(() => {
  const knownFields = ['actionId', 'actionName', 'fieldMappings'];
  const params: Record<string, any> = {};
  
  // Check if there's a params field
  if (props.nodeAttributes.params) {
    return props.nodeAttributes.params;
  }
  
  // Otherwise extract non-known fields as parameters
  for (const [key, value] of Object.entries(props.nodeAttributes)) {
    if (!knownFields.includes(key)) {
      params[key] = value;
    }
  }
  
  return Object.keys(params).length > 0 ? params : null;
});

// const hasParameters = computed(() => parameters.value !== null);

// Extract resolved parameters from field mappings
const resolvedParams = computed(() => {
  // Look for resolved values that came from field mappings
  const params: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props.nodeAttributes)) {
    // Skip known config fields and look for resolved values
    if (!['actionId', 'actionName', 'params', 'fieldMappings'].includes(key)) {
      params[key] = value;
    }
  }
  
  return params;
});

const hasResolvedParams = computed(() => Object.keys(resolvedParams.value).length > 0);

const formatValue = (value: any) => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // TODO: Show toast notification
  } catch (err) {
    console.error('Failed to copy text:', err);
  }
};
</script>

<style scoped>
.action-node-details {
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
</style>