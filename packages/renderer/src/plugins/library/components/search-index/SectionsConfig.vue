<template>
  <div class="space-y-6">
    <!-- Section-based Indexing with Segment Rules -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <button
          type="button"
          @click="() => { if (localData.enableSectionIndexing) segmentRulesExpanded = !segmentRulesExpanded }"
          class="flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-neutral-300 transition-colors"
          :class="{ 'cursor-not-allowed opacity-50': !localData.enableSectionIndexing }"
        >
          <ChevronDown 
            class="w-4 h-4 transition-transform" 
            :class="{ 'rotate-0': segmentRulesExpanded && localData.enableSectionIndexing, '-rotate-90': !segmentRulesExpanded || !localData.enableSectionIndexing }"
          />
          SEGMENT RULES
        </button>
        <div class="flex items-center gap-3">
          <label class="text-xs text-neutral-500">
            Enable section-based indexing
          </label>
          <ToggleSwitch
            v-model="localData.enableSectionIndexing"
            @update:modelValue="updateValue"
          />
        </div>
      </div>
      
      <div v-if="segmentRulesExpanded && localData.enableSectionIndexing" class="space-y-3">
        <!-- Rules List -->
        <div class="space-y-2">
          <div
            v-for="rule in localData.segmentRules"
          :key="rule.id"
          class="flex flex-wrap items-center gap-2 p-3 bg-neutral-800/30 border border-neutral-700/50 rounded-md"
        >
          <!-- Type Select -->
          <select
            v-model="rule.type"
            @change="updateValue"
            class="w-32 px-2 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-sm text-neutral-100 focus:border-neutral-600"
          >
              <option value="text">Text Block</option>
              <option value="list">List</option>
              <option value="field">Field</option>
            </select>
            
            <!-- Occurrence Input -->
            <OccurrenceInput
              v-model="rule.occurrence"
              @update:modelValue="updateValue"
            />
            
          <!-- Key Input (only for field type) -->
          <input
            v-if="rule.type === 'field'"
            v-model="rule.key"
            placeholder="Field key"
            class="w-40 px-2 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-sm text-neutral-100 outline-none focus:border-neutral-600 placeholder-neutral-500"
            @input="updateValue"
          />
          
          <!-- Index Mode for list and field types -->
          <div v-if="rule.type === 'list' || rule.type === 'field'" class="flex items-center gap-2">
            <label class="text-xs text-neutral-400">Mode:</label>
            <select
              v-model="rule.indexMode"
              @change="updateValue"
              class="w-28 px-2 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-sm text-neutral-100 focus:border-neutral-600"
            >
              <option value="combined">Combined</option>
              <option value="separate">Separate</option>
            </select>
          </div>
            
          <!-- Remove Button -->
          <button
            type="button"
            @click="removeRule(rule.id)"
            class="ml-auto p-1 text-neutral-400 hover:text-red-400"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
        
        <!-- Add Rule Button -->
        <button
          v-if="segmentRulesExpanded"
          type="button"
          @click="addRule"
          class="px-4 py-2 text-sm text-neutral-400 border border-neutral-700/50 rounded-md hover:border-neutral-600 hover:text-neutral-300"
        >
          <Plus class="w-4 h-4 inline mr-1" />
          Add Rule
        </button>
      </div>
    </div>

    <!-- Construct Document Section -->
    <div v-if="localData.enableSectionIndexing" class="pt-6 border-t border-neutral-800">
      <button
        type="button"
        @click="documentTemplateExpanded = !documentTemplateExpanded"
        class="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-4 hover:text-neutral-300 transition-colors"
      >
        <ChevronDown 
          class="w-4 h-4 transition-transform" 
          :class="{ 'rotate-0': documentTemplateExpanded, '-rotate-90': !documentTemplateExpanded }"
        />
        DOCUMENT TEMPLATE
      </button>
        
      <!-- Template Input -->
      <div v-if="documentTemplateExpanded" class="space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>Available variables:</span>
          <button
            v-for="i in Math.max(1, localData.segmentRules.length)"
            :key="i"
            type="button"
            @click="copyVariable(getSegmentVariable(i))"
            class="px-2 py-1 bg-neutral-800/30 border border-neutral-700/50 rounded text-neutral-400 font-mono hover:bg-neutral-800/50 hover:border-neutral-600 transition-colors cursor-pointer"
            title="Click to copy"
          >
            {{ getSegmentVariable(i) }}
          </button>
        </div>
        
        <textarea
          v-model="localData.constructTemplate"
          placeholder="e.g., {{segment 1}}: {{segment 2}}"
          rows="3"
          class="w-full px-3 pt-2 bg-neutral-800/50 border border-neutral-700/50 rounded-md text-neutral-100 text-sm outline-none focus:border-neutral-600 placeholder-neutral-500 resize-none font-mono"
          @input="updateValue"
        />
          
        <!-- Preview -->
        <div v-if="localData.constructTemplate">
          <button
            type="button"
            @click="showPreview = !showPreview"
            class="text-xs text-neutral-500 mb-1 hover:text-neutral-400 transition-colors"
          >
            Preview {{ showPreview ? '▼' : '▶' }}
          </button>
          <div v-if="showPreview" class="p-3 bg-neutral-800/30 border border-neutral-700/50 rounded-md text-sm text-neutral-300 font-mono whitespace-pre-wrap">
            {{ getTemplatePreview() }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Copy Feedback -->
    <CopyFeedback :show="showCopyFeedback" :message="copyMessage" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Plus, ChevronDown } from 'lucide-vue-next'
import ToggleSwitch from './form/ToggleSwitch.vue'
import OccurrenceInput from './form/OccurrenceInput.vue'
import CopyFeedback from '@/core/design/CopyFeedback.vue'
import type { SearchIndexFormData, SegmentRule } from '../../types/search-index'

const props = defineProps<{
  modelValue: SearchIndexFormData
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SearchIndexFormData]
}>()

const localData = ref<SearchIndexFormData>({ ...props.modelValue })

// Collapsible state
const segmentRulesExpanded = ref(true)
const documentTemplateExpanded = ref(true)

// Copy feedback state
const showCopyFeedback = ref(false)
const copyMessage = ref('')

// Preview state
const showPreview = ref(false)

watch(() => props.modelValue, (newValue) => {
  localData.value = { ...newValue }
}, { deep: true })

function updateValue() {
  emit('update:modelValue', { ...localData.value })
}

function addRule() {
  const newRule: SegmentRule = {
    id: `rule-${Date.now()}`,
    type: 'text',
    occurrence: 'all',
    indexMode: 'combined'
  }
  localData.value.segmentRules.push(newRule)
  updateValue()
}

function removeRule(id: string) {
  localData.value.segmentRules = localData.value.segmentRules.filter(
    rule => rule.id !== id
  )
  updateValue()
}


function getSegmentVariable(index: number): string {
  return `{{segment ${index}}}`
}

function getTemplatePreview(): string {
  const placeholders: Record<string, string> = {
    text: '[text block]',
    list: '[list items 1, 2, ...]',
    field: '[field key: value ...]'
  }
  
  // Check if any rules use separate mode
  const hasSeparateMode = localData.value.segmentRules.some(r => 
    (r.type === 'list' || r.type === 'field') && r.indexMode === 'separate'
  )
  
  let previewText = localData.value.constructTemplate.replace(/\{\{segment (\d+)\}\}/g, (match, num) => {
    const index = parseInt(num) - 1
    const rule = localData.value.segmentRules[index]
    if (!rule) return '[segment content...]'
    
    // Handle separate mode for lists and fields
    if (rule.indexMode === 'separate' && (rule.type === 'list' || rule.type === 'field')) {
      if (rule.type === 'field' && rule.key) {
        return `[${rule.key}: value_N]`
      } else if (rule.type === 'field') {
        return '[field_N: value_N]'
      }
      return '[list item_N]'
    }
    
    // Combined mode or text type
    if (rule.type === 'field' && rule.key) {
      return `[${rule.key}: value...]`
    }
    
    return placeholders[rule.type] || '[segment content...]'
  })
  
  // Add note about separate indexing if applicable
  if (hasSeparateMode) {
    previewText += '\n\n📝 Note: Fields marked with _N will create separate index entries for each item'
  }
  
  return previewText
}

async function copyVariable(variable: string) {
  try {
    await navigator.clipboard.writeText(variable)
    copyMessage.value = `Copied ${variable}`
    showCopyFeedback.value = false
    // Reset to trigger animation
    setTimeout(() => {
      showCopyFeedback.value = true
    }, 10)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>