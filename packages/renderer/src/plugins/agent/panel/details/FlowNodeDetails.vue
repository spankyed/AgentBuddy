<template>
  <div class="flow-node-details">
    <div class="detail-section">
      <h4 class="detail-label">Flow Configuration</h4>
      <div class="detail-grid">
        <div v-if="nodeAttributes.flowRef" class="detail-item">
          <span class="detail-key">Flow ID:</span>
          <span class="detail-value">{{ nodeAttributes.flowRef }}</span>
        </div>
        <div v-if="nodeAttributes.flowLabel" class="detail-item">
          <span class="detail-key">Flow Name:</span>
          <span class="detail-value">{{ nodeAttributes.flowLabel }}</span>
        </div>
      </div>
    </div>

    <div v-if="hasEntryParameter" class="detail-section">
      <h4 class="detail-label">Entry Parameter</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-key">payload:</span>
          <span class="detail-value">{{ formatValue(entryParameter) }}</span>
        </div>
      </div>
    </div>

    <div v-if="hasResolvedEntry" class="detail-section">
      <h4 class="detail-label">Resolved Entry Value</h4>
      <div class="detail-content">
        <pre class="detail-pre">{{ formatValue(resolvedEntry) }}</pre>
        <button @click="copyToClipboard(formatValue(resolvedEntry))" class="copy-button">
          <Copy class="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Copy } from 'lucide-vue-next';
import type { TNodeEntity } from '@app/api';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

// Extract entry parameter mapping
const entryParameter = computed(() => {
  const fieldMappings = props.nodeAttributes.fieldMappings;
  if (!fieldMappings) return null;
  
  const entryMapping = Array.isArray(fieldMappings) 
    ? fieldMappings.find((m: any) => m.target === 'entry')
    : (fieldMappings.target === 'entry' ? fieldMappings : null);
    
  return entryMapping?.source || null;
});

const hasEntryParameter = computed(() => entryParameter.value !== null);

// Extract resolved entry value (if execution has resolved it)
const resolvedEntry = computed(() => {
  // Look for entry in nodeAttributes (would be set during execution)
  return props.nodeAttributes.entry || props.nodeAttributes.resolvedEntry || null;
});

const hasResolvedEntry = computed(() => resolvedEntry.value !== null);

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
.flow-node-details {
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
</style>