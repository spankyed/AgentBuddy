<template>
  <div class="space-y-6">
    <!-- Index Name -->
    <div>
      <label class="block text-xs font-medium text-neutral-400 mb-1.5">
        INDEX NAME <span class="text-red-500">*</span>
      </label>
      <input
        v-model="localData.name"
        type="text"
        placeholder="Enter index name"
        class="w-full px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-neutral-100 text-sm focus:outline-none focus:border-neutral-600 placeholder-neutral-500"
        @input="updateValue"
      />
    </div>

    <!-- About Index -->
    <div>
      <label class="block text-xs font-medium text-neutral-400 mb-1.5">
        DESCRIPTION
      </label>
      <textarea
        v-model="localData.description"
        placeholder="Describe the purpose of this index"
        rows="3"
        class="w-full px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-neutral-100 text-sm focus:outline-none focus:border-neutral-600 placeholder-neutral-500 resize-none"
        @input="updateValue"
      />
    </div>

    <!-- Embedding Model -->
    <div>
      <label class="block text-xs font-medium text-neutral-400 mb-1.5">
        EMBEDDING MODEL
      </label>
      <Select
        v-model="localData.embeddingModel"
        class="w-full pl-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-neutral-100 text-sm focus:border-neutral-600"
        @update:modelValue="updateValue"
      >
        <optgroup label="Local Models (Fast, No API Key)">
          <option v-for="model in localModels" :key="model.id" :value="model.id">
            {{ model.displayName }} ({{ model.dimensions }}d, {{ model.speed }})
          </option>
        </optgroup>
        <optgroup label="API Models (Requires OpenAI Key)">
          <option v-for="model in apiModels" :key="model.id" :value="model.id">
            {{ model.displayName }} ({{ model.dimensions }}d)
          </option>
        </optgroup>
      </Select>
    </div>

    <!-- Index Metric and Connectors -->
    <div class="grid grid-cols-2 gap-6">
      <!-- Index Metric -->
      <div>
        <label class="block text-xs font-medium text-neutral-400 mb-1.5">
          INDEX METRIC
        </label>
        <div class="flex gap-2">
          <label
            v-for="metric in ['cosine', 'dot_product']"
            :key="metric"
            class="flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-md cursor-pointer transition-colors"
            :class="[
              localData.indexMetric === metric
                ? 'bg-neutral-700 border-neutral-600 text-neutral-100'
                : 'bg-neutral-800/30 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800/50'
            ]"
          >
            <input
              type="radio"
              :value="metric"
              v-model="localData.indexMetric"
              class="sr-only"
              @change="updateValue"
            />
            <div
              class="w-4 h-4 rounded-full border-2 flex items-center justify-center"
              :class="[
                localData.indexMetric === metric
                  ? 'border-neutral-400'
                  : 'border-neutral-600'
              ]"
            >
              <div
                v-if="localData.indexMetric === metric"
                class="w-2 h-2 rounded-full bg-neutral-400"
              />
            </div>
            <span class="text-sm capitalize">{{ metric.replace('_', ' ') }}</span>
          </label>
        </div>
      </div>

      <!-- Connectors -->
      <div>
        <label class="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-1.5">
          GRAPH CONNECTIVITY
          <span class="text-xs font-normal text-neutral-500">{{ getConnectorDescription(localData.connectors) }}</span>
        </label>
        <SegmentedSlider
          v-model="localData.connectors"
          :options="connectorOptions"
          @update:modelValue="updateValue"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import SegmentedSlider from './form/SegmentedSlider.vue'
import Select from '@/core/design/Select.vue'
import type { SearchIndexFormData } from '../../types/search-index'
import { EMBEDDING_MODEL_CONFIGS, getLocalModels, getApiModels, EMBEDDING_MODELS } from '../../config/embedding-models'

const props = defineProps<{
  modelValue: SearchIndexFormData
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SearchIndexFormData]
}>()

const localData = ref<SearchIndexFormData>({ ...props.modelValue })

const connectorOptions = [
  { value: 8, label: '8' },
  { value: 16, label: '16' },
  { value: 32, label: '32' },
  { value: 64, label: '64' }
]

// Get available models
const localModels = computed(() => getLocalModels())
const apiModels = computed(() => getApiModels())

watch(() => props.modelValue, (newValue) => {
  localData.value = { ...newValue }
}, { deep: true })

function updateValue() {
  emit('update:modelValue', { ...localData.value })
}

function getConnectorDescription(value: number): string {
  switch (value) {
    case 8: return 'Smaller index, faster search'
    case 16: return 'Balanced (default)'
    case 32: return 'Better recall'
    case 64: return 'Larger index, higher recall'
    default: return 'Custom'
  }
}

// Initialize with default model
onMounted(() => {
  if (!localData.value.embeddingModel) {
    localData.value.embeddingModel = EMBEDDING_MODELS.BGE_SMALL_EN_V15
    updateValue()
  }
})
</script>