<template>
  <div class="llm-node-details">
    <div class="detail-section">
      <h4 class="detail-label">Model Configuration</h4>
      <div class="detail-grid">
        <div v-if="nodeAttributes.model" class="detail-item">
          <span class="detail-key">Model:</span>
          <span class="detail-value">{{ nodeAttributes.model }}</span>
        </div>
        <div v-if="nodeAttributes.temperature !== undefined" class="detail-item">
          <span class="detail-key">Temperature:</span>
          <span class="detail-value">{{ nodeAttributes.temperature }}</span>
        </div>
        <div v-if="nodeAttributes.maxTokens" class="detail-item">
          <span class="detail-key">Max Tokens:</span>
          <span class="detail-value">{{ nodeAttributes.maxTokens }}</span>
        </div>
      </div>
    </div>

    <div v-if="nodeAttributes.systemPrompt" class="detail-section">
      <h4 class="detail-label">System Prompt</h4>
      <div class="detail-content">
        <pre class="detail-pre">{{ nodeAttributes.systemPrompt }}</pre>
        <button @click="copyToClipboard(nodeAttributes.systemPrompt)" class="copy-button">
          <Copy class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div v-if="nodeAttributes.promptTemplateId" class="detail-section">
      <h4 class="detail-label">Prompt Template</h4>
      <div class="detail-item">
        <span class="detail-key">Template ID:</span>
        <span class="detail-value">{{ nodeAttributes.promptTemplateId }}</span>
      </div>
    </div>

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
import { computed, ref } from 'vue';
import { Copy } from 'lucide-vue-next';
import type { TNodeEntity } from '@app/api';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();
  console.log('srops.nodeAttributes: ', props.nodeAttributes);

const showFullPrompt = ref(false);
const MAX_PROMPT_LENGTH = 200;

// Extract resolved parameters (excluding known LLM config fields)
const resolvedParams = computed(() => {
  const knownFields = ['model', 'temperature', 'maxTokens', 'systemPrompt', 'prompt', 'promptTemplateId', 'fieldMappings'];
  const params: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props.nodeAttributes)) {
    if (!knownFields.includes(key)) {
      params[key] = value;
    }
  }
  
  return params;
});

const hasResolvedParams = computed(() => Object.keys(resolvedParams.value).length > 0);

const isPromptTruncated = computed(() => {
  return props.nodeAttributes.prompt && props.nodeAttributes.prompt.length > MAX_PROMPT_LENGTH;
});

const truncatePrompt = (prompt: string) => {
  if (!prompt) return '';
  if (!isPromptTruncated.value || showFullPrompt.value) return prompt;
  return prompt.substring(0, MAX_PROMPT_LENGTH) + '...';
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