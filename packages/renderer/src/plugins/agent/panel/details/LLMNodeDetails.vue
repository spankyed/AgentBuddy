<template>
  <div class="llm-node-details">
    <div v-if="hasInputParams" class="detail-section">
      <h4 class="detail-label">Input Parameters</h4>
      <div class="detail-grid">
        <div v-for="(value, key) in inputParams" :key="key" class="detail-item">
          <span class="detail-key">{{ key }}:</span>
          <span v-if="!isComplexValue(value)" class="detail-value">{{ formatValue(value) }}</span>
          <div v-else class="detail-value">
            <DataRenderer :data="value" :default-expanded="false" />
          </div>
        </div>
      </div>
    </div>

    <!-- Keep prompt as separate section for better readability -->
    <div v-if="nodeAttributes.prompt" class="detail-section">
      <h4 class="detail-label">Prompt</h4>
      <div class="detail-content">
        <pre class="detail-pre">{{ truncatePrompt(nodeAttributes.prompt) }}</pre>
        <div class="detail-actions">
          <button v-if="isPromptTruncated" @click="showFullPrompt = !showFullPrompt" class="expand-button">
            {{ showFullPrompt ? 'Show less' : 'Show more' }}
          </button>
          <button @click="copyToClipboard(nodeAttributes.prompt)" class="copy-button">
            <Copy class="w-3 h-3" />
          </button>
        </div>
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
import { computed, ref } from 'vue';
import { Copy } from 'lucide-vue-next';
import type { TNodeEntity } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

const showFullPrompt = ref(false);
const MAX_PROMPT_LENGTH = 200;

// Show all input parameters except result and prompt (prompt shown separately)
const inputParams = computed(() => {
  const params: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props.nodeAttributes)) {
    // Exclude result (output) and prompt (shown in separate sections)
    if (key !== 'result' && key !== 'prompt') {
      params[key] = value;
    }
  }
  
  return params;
});

const outputResult = computed(() => props.nodeAttributes.result);

const hasInputParams = computed(() => Object.keys(inputParams.value).length > 0);
const hasOutput = computed(() => outputResult.value !== undefined);

const isPromptTruncated = computed(() => {
  return props.nodeAttributes.prompt && props.nodeAttributes.prompt.length > MAX_PROMPT_LENGTH;
});

const truncatePrompt = (prompt: string) => {
  if (!prompt) return '';
  if (!isPromptTruncated.value || showFullPrompt.value) return prompt;
  return prompt.substring(0, MAX_PROMPT_LENGTH) + '...';
};

const isComplexValue = (value: any): boolean => {
  return value !== null && typeof value === 'object';
};

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
.llm-node-details {
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
  align-items: flex-start;
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

.detail-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
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

.expand-button {
  padding: 0.25rem 0.5rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.25rem;
  color: #60a5fa;
  font-size: 0.6875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.expand-button:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.3);
}
</style>