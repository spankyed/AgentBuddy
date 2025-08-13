<template>
  <div class="listen-node-details">
    <div class="detail-section">
      <h4 class="detail-label">Event Listener Configuration</h4>
      <div class="detail-grid">
        <div v-if="nodeAttributes.eventType" class="detail-item">
          <span class="detail-key">Event Type:</span>
          <span class="detail-value">{{ nodeAttributes.eventType }}</span>
        </div>
        <div v-if="nodeAttributes.mode" class="detail-item">
          <span class="detail-key">Mode:</span>
          <span class="detail-value mode-badge" :class="`mode-${nodeAttributes.mode}`">
            {{ nodeAttributes.mode }}
          </span>
        </div>
        <div v-if="nodeAttributes.scope" class="detail-item">
          <span class="detail-key">Scope:</span>
          <span class="detail-value">{{ nodeAttributes.scope }}</span>
        </div>
        <div v-if="nodeAttributes.debounceMs" class="detail-item">
          <span class="detail-key">Debounce:</span>
          <span class="detail-value">{{ nodeAttributes.debounceMs }}ms</span>
        </div>
      </div>
    </div>

    <div v-if="hasEventData" class="detail-section">
      <h4 class="detail-label">Event Data Schema</h4>
      <div class="detail-content">
        <DataRenderer :data="getEventSchema()" :default-expanded="false" />
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

const hasEventData = computed(() => {
  // Check if there's any event data schema information
  return props.nodeAttributes.eventSchema || props.nodeAttributes.expectedFields;
});

const getEventSchema = () => {
  // Return event schema information if available
  if (props.nodeAttributes.eventSchema) {
    return props.nodeAttributes.eventSchema;
  }
  
  if (props.nodeAttributes.expectedFields) {
    return props.nodeAttributes.expectedFields;
  }
  
  // Default schema for common event types
  const eventType = props.nodeAttributes.eventType;
  if (eventType === 'user.message') {
    return {
      message: 'string',
      userId: 'string?',
      timestamp: 'number'
    };
  }
  
  return { info: 'No schema information available' };
};
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