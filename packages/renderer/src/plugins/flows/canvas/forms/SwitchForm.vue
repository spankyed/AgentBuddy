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
            v-for="(condition, displayIndex) in regularConditions"
            :key="getConditionIndex(condition)"
            class="p-3 border rounded-md bg-neutral-800/30 border-neutral-700"
          >
            <div class="flex items-start justify-between gap-2 mb-3">
              <span class="px-2 py-0.5 text-xs font-medium rounded bg-neutral-700 text-neutral-300">
                {{ displayIndex + 1 }}
              </span>
              <div class="flex items-center gap-1">
                <button
                  @click="toggleBranchMode(getConditionIndex(condition))"
                  class="p-1 rounded transition-colors"
                  :class="condition.mode === 'code'
                    ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50'"
                  :title="condition.mode === 'code' ? 'Switch to expression mode' : 'Switch to code mode'"
                >
                  <Code class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="removeBranch(getConditionIndex(condition))"
                  class="p-1 text-neutral-500 hover:text-red-400 hover:bg-neutral-700/50 rounded transition-colors"
                  title="Remove branch"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Branch Label (optional) -->
            <div class="mb-3">
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Label <span class="text-neutral-600">(optional)</span>
              </label>
              <input
                :value="condition.label || ''"
                @input="updateBranch(getConditionIndex(condition), 'label', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="e.g. Is Admin"
                class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
            </div>

            <!-- Code Mode -->
            <template v-if="condition.mode === 'code'">
              <!-- Key (optional in code mode) -->
              <div class="mb-3">
                <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                  Key <span class="text-neutral-600">(optional)</span>
                </label>
                <input
                  :value="getPredicateObject(condition.predicate)?.key || ''"
                  @input="updatePredicate(getConditionIndex(condition), 'key', ($event.target as HTMLInputElement).value)"
                  type="text"
                  placeholder="e.g. $.user.role — resolved as params.value"
                  class="w-full px-3 py-2 text-sm font-mono border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                />
                <p class="mt-1 text-[11px] text-neutral-500">
                  If set, resolved value is available as <code class="text-neutral-400">params.value</code>. If empty, <code class="text-neutral-400">params</code> contains the full context (event, steps, lastStep).
                </p>
              </div>

              <!-- Code Editor -->
              <div>
                <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                  Code <span class="text-red-500">*</span>
                </label>
                <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 150px;">
                  <SimpleMonacoEditor
                    :model-value="condition.code || ''"
                    language="typescript"
                    :function-body="true"
                    dsl-type="action"
                    :options="{ lineNumbers: 'off', glyphMargin: false, folding: false, lineDecorationsWidth: 8, lineNumbersMinChars: 0 }"
                    @update:model-value="updateBranchCode(getConditionIndex(condition), $event)"
                  />
                </div>
                <p class="mt-1 text-[11px] text-neutral-500">
                  Must return a boolean. Example: <code class="text-neutral-400">return params.value === 'admin'</code>
                </p>
              </div>
            </template>

            <!-- Expression Mode (default) -->
            <template v-else>
              <!-- Predicate: Key -->
              <div class="mb-3">
                <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                  Key <span class="text-red-500">*</span>
                </label>
                <input
                  :value="getPredicateObject(condition.predicate)?.key || ''"
                  @input="updatePredicate(getConditionIndex(condition), 'key', ($event.target as HTMLInputElement).value)"
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
                  @change="updatePredicate(getConditionIndex(condition), 'operator', ($event.target as HTMLSelectElement).value)"
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
                  @input="updatePredicate(getConditionIndex(condition), 'value', ($event.target as HTMLInputElement).value)"
                  type="text"
                  placeholder="e.g. admin, 10, true, or $.path.to.value"
                  class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                />
              </div>
            </template>
          </div>

          <!-- Empty state -->
          <div
            v-if="regularConditions.length === 0"
            class="p-4 text-center border border-dashed rounded-md border-neutral-700 text-neutral-500"
          >
            <p class="text-sm">No conditional branches yet.</p>
            <p class="mt-1 text-xs">Add branches to create conditional paths. The else branch catches unmatched cases.</p>
          </div>

          <!-- Else / Default Branch -->
          <div
            v-if="elseCondition"
            class="p-3 border rounded-md bg-neutral-800/30 border-orange-500/30"
          >
            <div class="flex items-center gap-2 mb-3">
              <span class="px-2 py-0.5 text-xs font-medium rounded bg-orange-500/20 text-orange-300">
                Else
              </span>
              <span class="text-[11px] text-neutral-500">Matches when no other branch does</span>
            </div>
            <div>
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Label <span class="text-neutral-600">(optional)</span>
              </label>
              <input
                :value="elseCondition.label || ''"
                @input="updateBranch(elseIndex, 'label', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="e.g. Default, Fallback"
                class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Example Values -->
      <TipSection />
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { Plus, Trash2, Code } from 'lucide-vue-next'
import BaseForm from './BaseForm.vue'
import TipSection from '../components/TipSection.vue'
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue'
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

// Ensure an else branch exists in the conditions array
function ensureElseBranch(conditions: Condition[]): Condition[] {
  const hasElse = conditions.some(c => c.predicate === undefined)
  if (hasElse) return conditions
  return [...conditions, { predicate: undefined, label: 'Else' }]
}

// Local state decoupled from prop reactivity — prevents v-for re-render from resetting inputs
const localConditions = shallowRef<Condition[]>(
  ensureElseBranch(structuredClone((props.node as SwitchNode).conditions || []))
)

// Reset when node identity changes (covers temp→permanent ID reconciliation)
watch(
  () => props.node.id,
  () => {
    localConditions.value = ensureElseBranch(
      structuredClone((props.node as SwitchNode).conditions || [])
    )
  }
)

// Separate regular conditions from the else condition
const regularConditions = computed(() =>
  localConditions.value.filter(c => c.predicate !== undefined)
)

const elseCondition = computed(() =>
  localConditions.value.find(c => c.predicate === undefined)
)

const elseIndex = computed(() =>
  localConditions.value.findIndex(c => c.predicate === undefined)
)

// Map a regular condition back to its index in localConditions
function getConditionIndex(condition: Condition): number {
  return localConditions.value.indexOf(condition)
}

function addBranch() {
  const newCondition: Condition = {
    predicate: { key: '', operator: 'equals' as BinaryOperator, value: '' },
    label: ''
  }
  const updated = [...localConditions.value]
  updated.splice(elseIndex.value, 0, newCondition)
  localConditions.value = updated
  emit('update-node', { conditions: localConditions.value })
}

function removeBranch(index: number) {
  if (localConditions.value[index]?.predicate === undefined) return
  localConditions.value = localConditions.value.filter((_, i) => i !== index)
  emit('update-node', { conditions: localConditions.value })
}

function updateBranch(index: number, field: 'label', value: string) {
  localConditions.value = localConditions.value.map((cond, i) =>
    i === index ? { ...cond, [field]: value } : cond
  )
  emit('update-node', { conditions: localConditions.value })
}

function toggleBranchMode(index: number) {
  const current = localConditions.value[index]
  const newMode = (current.mode === 'code') ? 'expression' : 'code'
  localConditions.value = localConditions.value.map((cond, i) =>
    i === index ? { ...cond, mode: newMode } : cond
  )
  emit('update-node', { conditions: localConditions.value })
}

function updateBranchCode(index: number, code: string) {
  localConditions.value = localConditions.value.map((cond, i) =>
    i === index ? { ...cond, code } : cond
  )
  emit('update-node', { conditions: localConditions.value })
}

function updatePredicate(index: number, field: 'key' | 'operator' | 'value', value: string) {
  localConditions.value = localConditions.value.map((cond, i) => {
    if (i !== index) return cond
    const currentPredicate = cond.predicate && typeof cond.predicate !== 'function'
      ? cond.predicate
      : { key: '', operator: 'equals' as BinaryOperator }
    let parsedValue: any = value
    if (field === 'value' && !value.startsWith('$.')) {
      if (value === 'true') parsedValue = true
      else if (value === 'false') parsedValue = false
      else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value)
    }
    return {
      ...cond,
      predicate: { ...currentPredicate, [field]: field === 'value' ? parsedValue : value }
    }
  })
  emit('update-node', { conditions: localConditions.value })
}
</script>
