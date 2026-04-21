<template>
  <HoverCardRoot :open-delay="300" :close-delay="100">
    <HoverCardTrigger as-child>
      <div 
        class="max-w-xs truncate cursor-default"
      >
        {{ formatCellValue(value) }}
      </div>
    </HoverCardTrigger>
    
    <HoverCardPortal>
      <HoverCardContent
        v-if="isJsonLike(value)"
        :side="'top'"
        :align="'start'"
        :side-offset="5"
        class="z-50 w-[36rem] max-w-[90vw] bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden"
        @pointer-down-outside.prevent
      >
        <div class="relative">
          <!-- Header -->
          <div class="flex items-center justify-between px-3 py-2 bg-neutral-850 border-b border-neutral-800">
            <span class="text-xs font-medium text-neutral-400">
              {{ getJsonTypeLabel(value) }}
            </span>
            <button
              @click="copyJson"
              class="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
              title="Copy JSON"
            >
              <Copy v-if="!copied" class="w-3 h-3" />
              <Check v-else class="w-3 h-3 text-green-500" />
            </button>
          </div>
          
          <!-- JSON Content -->
          <div class="max-h-96 overflow-auto">
            <div class="p-3">
              <div class="rounded overflow-hidden border border-neutral-800" :style="{ height: jsonHeight }">
                <SimpleMonacoEditor
                  :model-value="formattedJson"
                  language="json"
                  :read-only="true"
                  class="h-full w-full"
                />
              </div>
            </div>
          </div>
          
          <!-- Footer with stats -->
          <div class="px-3 py-2 bg-neutral-850 border-t border-neutral-800">
            <div class="flex items-center justify-between text-xs text-neutral-500">
              <span>{{ getJsonStats(value) }}</span>
              <span>{{ formattedJson.length }} chars</span>
            </div>
          </div>
        </div>
        
        <HoverCardArrow class="fill-neutral-700" />
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Copy, Check } from 'lucide-vue-next';
import {
  HoverCardRoot,
  HoverCardTrigger,
  HoverCardContent,
  HoverCardPortal,
  HoverCardArrow,
} from 'reka-ui';
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';
import { 
  isJsonLike, 
  isJsonString, 
  isJsonObject, 
  isJsonArray,
  formatJsonValue 
} from '../utils/json-detection';

interface Props {
  value: any;
}

const props = defineProps<Props>();
const copied = ref(false);
let copyTimeout: NodeJS.Timeout | undefined;

const formattedJson = computed(() => {
  return formatJsonValue(props.value);
});

const jsonHeight = computed(() => {
  const lineCount = formattedJson.value.split('\n').length;
  // Limit height between 100px and 300px
  const height = Math.min(300, Math.max(100, lineCount * 18));
  return `${height}px`;
});

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getJsonTypeLabel(value: any): string {
  if (isJsonString(value)) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return 'JSON Array (string)';
      return 'JSON Object (string)';
    } catch {
      return 'JSON';
    }
  }
  if (isJsonArray(value)) return 'Array';
  if (isJsonObject(value)) return 'Object';
  return 'JSON';
}

function getJsonStats(value: any): string {
  let parsed = value;
  
  if (isJsonString(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return '';
    }
  }
  
  if (Array.isArray(parsed)) {
    return `${parsed.length} items`;
  }
  
  if (typeof parsed === 'object' && parsed !== null) {
    const keys = Object.keys(parsed);
    return `${keys.length} ${keys.length === 1 ? 'property' : 'properties'}`;
  }
  
  return '';
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(formattedJson.value);
    copied.value = true;
    
    if (copyTimeout) {
      clearTimeout(copyTimeout);
    }
    
    copyTimeout = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy JSON:', err);
  }
}
</script>