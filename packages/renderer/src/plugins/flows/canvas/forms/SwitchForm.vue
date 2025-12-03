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

            <!-- Expression -->
            <div>
              <label class="block mb-1.5 text-xs font-medium text-neutral-400">
                Expression <span class="text-red-500">*</span>
              </label>
              <input
                :value="condition.expr"
                @input="updateBranch(index, 'expr', ($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="e.g. $.user.role == 'admin'"
                class="w-full px-3 py-2 text-sm font-mono border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
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

      <!-- Expression Tips -->
      <div class="pt-4 border-t border-neutral-800">
        <details class="group">
          <summary class="flex items-center gap-2 text-xs font-medium cursor-pointer text-neutral-500 hover:text-neutral-400">
            <ChevronRight class="w-3 h-3 transition-transform group-open:rotate-90" />
            Expression Examples
          </summary>
          <div class="mt-3 p-3 rounded-md bg-neutral-800/30 border border-neutral-700 text-xs text-neutral-400 space-y-2">
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.user.role == 'admin'</code> - Equals check</p>
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.count > 10</code> - Numeric comparison</p>
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.items.length > 0</code> - Array length check</p>
            <p><code class="px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">$.status == 'active' && $.verified</code> - Combined conditions</p>
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
import type { NodeEntity, SwitchNode } from '@app/api'

const props = defineProps<{
  node: NodeEntity
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// Get conditions array from node
const conditions = computed(() => {
  const switchNode = props.node as SwitchNode
  return switchNode.conditions || []
})

// Add a new branch
function addBranch() {
  const newConditions = [...conditions.value, { expr: '', label: '' }]
  emit('update-node', { conditions: newConditions })
}

// Remove a branch by index
function removeBranch(index: number) {
  const newConditions = conditions.value.filter((_, i) => i !== index)
  emit('update-node', { conditions: newConditions })
}

// Update a specific branch field
function updateBranch(index: number, field: 'expr' | 'label', value: string) {
  const newConditions = conditions.value.map((cond, i) => {
    if (i === index) {
      return { ...cond, [field]: value }
    }
    return cond
  })
  emit('update-node', { conditions: newConditions })
}
</script>
