<template>
  <div class="fire-node-details">
    <div class="detail-section">
      <h4 class="detail-label">Fire Event Configuration</h4>
      <div class="detail-grid">
        <div v-if="nodeAttributes.eventType" class="detail-item">
          <span class="detail-key">Event Type:</span>
          <span class="detail-value">{{ nodeAttributes.eventType }}</span>
        </div>
        <div v-if="nodeAttributes.scope" class="detail-item">
          <span class="detail-key">Scope:</span>
          <span class="detail-value scope-badge" :class="`scope-${nodeAttributes.scope}`">
            {{ nodeAttributes.scope }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="nodeAttributes.payload" class="detail-section">
      <h4 class="detail-label">Event Payload</h4>
      <div class="detail-content">
        <pre class="detail-pre">{{ formatPayload() }}</pre>
        <button @click="copyToClipboard(formatPayload())" class="copy-button">
          <Copy class="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy } from 'lucide-vue-next';
import type { TNodeEntity } from '@abuddy/api';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

const formatPayload = () => {
  if (typeof props.nodeAttributes.payload === 'string') {
    return props.nodeAttributes.payload;
  }
  return JSON.stringify(props.nodeAttributes.payload, null, 2);
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
.fire-node-details {
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

.scope-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;
}

.scope-local {
  background: rgba(59, 130, 246, 0.1);
  color: #93bbfe;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.scope-global {
  background: rgba(168, 85, 247, 0.1);
  color: #c4b5fd;
  border: 1px solid rgba(168, 85, 247, 0.2);
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