<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <!-- Branches Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <label class="text-xs font-semibold tracking-wider uppercase text-neutral-500">
            Branches
          </label>
          <button
            @click="addBranch"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 transition-colors rounded hover:bg-neutral-700/50 hover:text-blue-300"
          >
            <Plus class="w-3 h-3" />
            Add Branch
          </button>
        </div>

        <!-- Branch List -->
        <div class="space-y-3">
          <div
            v-for="(condition, index) in conditions"
            :key="index"
            class="p-3 border rounded-md bg-neutral-800/30 border-neutral-700"
          >
            <div class="flex items-start justify-between gap-2 mb-3">
              <span class="px-2 py-0.5 text-xs font-medium rounded bg-neutral-700 text-neutral-300">
                {{ index + 1 }}
              </span>
              <button
                @click="removeBranch(index)"
                class="p-1 text-neutral-500 hover:text-red-400 hover:bg-neutral-700/50 rounded transition-colors"
                title="Remove branch"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Branch Label (optional) -->
            <div class="mb-3">
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Label <span class="text-neutral-600">(optional)</span>
              </label>
              <input
                :value="condition.label || ''"
                @input="updateBranch(index, 'label', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="e.g. Is Admin"
                class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
            </div>

            <!-- Predicate: Key -->
            <div class="mb-3">
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Key <span class="text-red-500">*</span>
              </label>
              <input
                :value="getPredicateObject(condition.predicate)?.key || ''"
                @input="updatePredicate(index, 'key', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="e.g. $.user.role or $.lastStep.result.status"
                class="w-full px-3 py-2 text-sm font-mono border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
            </div>

            <!-- Predicate: Operator -->
            <div class="mb-3">
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Operator <span class="text-red-500">*</span>
              </label>
              <select
                :value="getPredicateObject(condition.predicate)?.operator || 'equals'"
                @change="updatePredicate(index, 'operator', ($event.target as HTMLSelectElement).value)"
                class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              >
                <option v-for="op in operators" :key="op.value" :value="op.value">
                  {{ op.label }}
                </option>
              </select>
            </div>

            <!-- Predicate: Value (hidden for unary operators) -->
            <div v-if="!isUnaryOperator(getPredicateObject(condition.predicate)?.operator)">
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Value
              </label>
              <input
                :value="getPredicateObject(condition.predicate)?.value ?? ''"
                @change="updatePredicate(index, 'value', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="e.g. admin, 10, true, or $.path.to.value"
                class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-if="conditions.length === 0"
            class="p-4 text-center border border-dashed rounded-md border-neutral-700 text-neutral-500"
          >
            <p class="text-sm">No branches yet.</p>
            <p class="mt-1 text-xs">Add branches to create conditional paths.</p>
          </div>
        </div>
      </div>

      <!-- Key Path Tips -->
      <div class="pt-4 border-t border-neutral-800">
        <details class="group">
          <summary class="flex items-center gap-2 text-xs font-medium cursor-pointer text-neutral-500 hover:text-neutral-400">
            <ChevronRight class="w-3 h-3 transition-transform group-open:rotate-90" />
            Key Path Examples
          </summary>
          <div class="mt-3 p-3 rounded-md bg-neutral-800/30 border border-neutral-700 text-xs text-neutral-400 space-y-2">
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.event.data.status</code> - Event payload field</p>
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.lastStep.result</code> - Previous step result</p>
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.steps[label=MyStep].result</code> - Specific step by label</p>
          </div>
        </details>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2, ChevronRight } from 'lucide-vue-next'
import BaseForm from './BaseForm.vue'
import type { NodeEntity, SwitchNode, Condition, BinaryOperator, Predicate } from '@app/api'

// Type guard and accessor for object predicates (vs function predicates)
function getPredicateObject(predicate?: Predicate): { key: string; operator: BinaryOperator; value?: any } | undefined {
  if (!predicate || typeof predicate === 'function') return undefined
  return predicate
}

const props = defineProps<{
  node: NodeEntity
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// Operator options for dropdown
const operators = [
  { value: 'equals', label: 'Equals (==)' },
  { value: 'not_equals', label: 'Not Equals (!=)' },
  { value: 'greater_than', label: 'Greater Than (>)' },
  { value: 'less_than', label: 'Less Than (<)' },
  { value: 'greater_than_or_equals', label: 'Greater Than or Equals (>=)' },
  { value: 'less_than_or_equals', label: 'Less Than or Equals (<=)' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'matches', label: 'Matches (regex)' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_null', label: 'Is Null' },
]

// Check if operator is unary (doesn't need value)
function isUnaryOperator(operator?: string): boolean {
  return operator === 'is_empty' || operator === 'is_null'
}

// Get conditions array from node
const conditions = computed(() => {
  const switchNode = props.node as SwitchNode
  return switchNode.conditions || []
})

// Add a new branch with default predicate
function addBranch() {
  const newConditions: Condition[] = [
    ...conditions.value,
    {
      predicate: { key: '', operator: 'equals' as BinaryOperator, value: '' },
      label: ''
    }
  ]
  emit('update-node', { conditions: newConditions })
}

// Remove a branch by index
function removeBranch(index: number) {
  const newConditions = conditions.value.filter((_, i) => i !== index)
  emit('update-node', { conditions: newConditions })
}

// Update a specific branch field (label)
function updateBranch(index: number, field: 'label', value: string) {
  const newConditions = conditions.value.map((cond, i) => {
    if (i === index) {
      return { ...cond, [field]: value }
    }
    return cond
  })
  emit('update-node', { conditions: newConditions })
}

// Update predicate field (key, operator, value)
function updatePredicate(index: number, field: 'key' | 'operator' | 'value', value: string) {
  const newConditions = conditions.value.map((cond, i) => {
    if (i === index) {
      const currentPredicate = cond.predicate && typeof cond.predicate !== 'function'
        ? cond.predicate
        : { key: '', operator: 'equals' as BinaryOperator }

      // Parse value for type detection
      let parsedValue: any = value
      if (field === 'value' && !value.startsWith('$.')) {
        if (value === 'true') parsedValue = true
        else if (value === 'false') parsedValue = false
        else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value)
      }

      return {
        ...cond,
        predicate: {
          ...currentPredicate,
          [field]: field === 'value' ? parsedValue : value
        }
      }
    }
    return cond
  })
  emit('update-node', { conditions: newConditions })
}
</script>
