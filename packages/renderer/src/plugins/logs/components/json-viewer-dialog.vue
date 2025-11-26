<template>
  <Dialog
    :model-value="modelValue"
    :title="title"
    :show-close-button="true"
    content-class="json-viewer-dialog-content"
    @update:model-value="$emit('update:modelValue', $event)"
    @cancel="handleClose"
  >
    <div class="json-viewer-container">
      <!-- Scrollable JSON content -->
      <div class="json-content">
        <DataRenderer :data="data" :default-expanded="true" :hide-expand="true" />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Dialog from '@/core/components/design/dialog.vue'
import DataRenderer from '../data-renderer.vue'

interface Props {
  modelValue: boolean
  data: any
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'JSON Viewer'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const handleClose = () => {
  emit('update:modelValue', false)
}
</script>

<style>
/* Custom dialog width for JSON viewer */
.json-viewer-dialog-content {
  width: 90vw !important;
  max-width: 1200px !important;
}
</style>

<style scoped>
.json-viewer-container {
  width: 100%;
}

.json-content {
  max-height: 70vh;
  overflow: auto;
  padding: 1rem;
  background: #0a0a0a;
  border: 1px solid #262626;
  border-radius: 8px;
}

/* Custom scrollbar for the JSON content */
.json-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.json-content::-webkit-scrollbar-track {
  background: #161616;
  border-radius: 4px;
}

.json-content::-webkit-scrollbar-thumb {
  background: #404040;
  border-radius: 4px;
}

.json-content::-webkit-scrollbar-thumb:hover {
  background: #525252;
}
</style>