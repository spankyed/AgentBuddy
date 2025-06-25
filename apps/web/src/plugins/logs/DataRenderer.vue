<template>
  <div class="data-renderer">
    <div v-if="isPrimitive(data)" class="primitive-value">
      <span class="value-type">{{ getType(data) }}</span>
      <span class="value-content">{{ formatPrimitive(data) }}</span>
    </div>
    
    <div v-else-if="Array.isArray(data)" class="array-value">
      <div class="array-header">
        <button @click="toggleExpanded" class="expand-toggle">
          <ChevronRight :class="['chevron', { expanded }]" :size="12" />
          Array[{{ data.length }}]
        </button>
      </div>
      <Transition name="expand">
        <div v-if="expanded" class="array-items">
          <div v-for="(item, index) in data" :key="index" class="array-item">
            <span class="item-index">{{ index }}:</span>
            <DataRenderer :data="item" />
          </div>
        </div>
      </Transition>
    </div>
    
    <div v-else-if="isObject(data)" class="object-value">
      <div class="object-header">
        <button @click="toggleExpanded" class="expand-toggle">
          <ChevronRight :class="['chevron', { expanded }]" :size="12" />
          {{ getObjectPreview(data) }}
        </button>
      </div>
      <Transition name="expand">
        <div v-if="expanded" class="object-properties">
          <div v-for="[key, value] in Object.entries(data)" :key="key" class="object-property">
            <span class="property-key">{{ key }}:</span>
            <DataRenderer :data="value" />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  data: any;
  defaultExpanded?: boolean;
}>();

const expanded = ref(props.defaultExpanded ?? false);

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};

const isPrimitive = (value: any): boolean => {
  return value === null || 
         value === undefined ||
         typeof value === 'string' ||
         typeof value === 'number' ||
         typeof value === 'boolean';
};

const isObject = (value: any): boolean => {
  return value !== null && 
         typeof value === 'object' && 
         !Array.isArray(value);
};

const getType = (value: any): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return typeof value;
};

const formatPrimitive = (value: any): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
};

const getObjectPreview = (obj: any): string => {
  const keys = Object.keys(obj);
  const preview = keys.slice(0, 3).join(', ');
  const suffix = keys.length > 3 ? ', ...' : '';
  return `{ ${preview}${suffix} }`;
};
</script>

<style scoped>
.data-renderer {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
}

/* Primitive Values */
.primitive-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.value-type {
  color: #666;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.value-content {
  color: #e1e1e1;
}

/* String values */
.primitive-value:has(.value-type:contains("string")) .value-content {
  color: #98c379;
}

/* Number values */
.primitive-value:has(.value-type:contains("number")) .value-content {
  color: #d19a66;
}

/* Boolean values */
.primitive-value:has(.value-type:contains("boolean")) .value-content {
  color: #56b6c2;
}

/* Null/undefined */
.primitive-value:has(.value-type:contains("null")),
.primitive-value:has(.value-type:contains("undefined")) {
  opacity: 0.6;
}

/* Arrays and Objects */
.array-value,
.object-value {
  margin: 2px 0;
}

.array-header,
.object-header {
  margin-bottom: 4px;
}

.expand-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: transparent;
  border: none;
  color: #999;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.2s;
  border-radius: 4px;
}

.expand-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e1e1e1;
}

.chevron {
  transition: transform 0.2s;
}

.chevron.expanded {
  transform: rotate(90deg);
}

/* Array Items */
.array-items {
  margin-left: 20px;
  padding-left: 12px;
  border-left: 1px solid #262626;
}

.array-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
}

.item-index {
  color: #666;
  min-width: 30px;
  font-size: 11px;
}

/* Object Properties */
.object-properties {
  margin-left: 20px;
  padding-left: 12px;
  border-left: 1px solid #262626;
}

.object-property {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
}

.property-key {
  color: #c678dd;
  min-width: fit-content;
  font-size: 12px;
}

/* Nested structures */
.data-renderer .data-renderer {
  display: inline-block;
}

/* Animations */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  transform-origin: top;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: scaleY(0.8);
}
</style> 