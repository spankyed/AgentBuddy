<template>
  <div class="space-y-3">
    <!-- Directory path -->
    <p class="text-xs text-neutral-500 font-mono truncate" :title="preview.directory">
      {{ preview.directory }}
    </p>

    <!-- Type rows -->
    <div class="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
      <div v-for="row in rows" :key="row.key">
        <!-- Header row -->
        <div
          :class="[
            'flex items-center gap-3 px-3 py-2.5 select-none',
            row.isEmpty ? 'opacity-40' : 'hover:bg-neutral-800/40',
          ]"
        >
          <!-- Expand chevron -->
          <button
            type="button"
            class="flex items-center justify-center w-5 h-5 text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed"
            :disabled="row.isEmpty || importing"
            @click="emit('toggle-expand', row.key)"
          >
            <component
              :is="expanded[row.key] ? ChevronDown : ChevronRight"
              class="w-4 h-4"
            />
          </button>

          <!-- Header checkbox -->
          <input
            type="checkbox"
            class="w-4 h-4 cursor-pointer disabled:cursor-not-allowed accent-blue-600"
            :checked="row.allSelected"
            :indeterminate.prop="row.indeterminate"
            :disabled="row.isEmpty || importing"
            @change="emit('toggle-type-all', row.key)"
          />

          <!-- Icon + label -->
          <component :is="row.icon" class="w-4 h-4 text-neutral-400" />
          <span class="text-sm text-neutral-200 font-medium">{{ row.label }}</span>

          <!-- Count / status -->
          <span class="ml-auto text-xs text-neutral-500">
            <template v-if="row.missing">not found</template>
            <template v-else-if="row.isEmpty">no items</template>
            <template v-else>
              {{ row.selectedCount }} / {{ row.totalCount }} items
            </template>
          </span>
        </div>

        <!-- Expanded item list -->
        <div
          v-if="expanded[row.key] && !row.isEmpty"
          class="px-3 pb-3 pl-11 space-y-1 bg-neutral-900/40"
        >
          <label
            v-for="item in preview[row.key]"
            :key="item.key"
            :class="[
              'flex items-start gap-2 py-1 text-xs rounded',
              importing ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-neutral-800/40',
            ]"
          >
            <input
              type="checkbox"
              class="mt-0.5 w-3.5 h-3.5 accent-blue-600"
              :checked="selection[row.key].includes(item.key)"
              :disabled="importing"
              @change="emit('toggle-item', { key: row.key, item: item.key })"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <span class="text-neutral-200 font-mono truncate">{{ item.key }}</span>
                <span
                  v-if="item.childCount && item.childCount > 0"
                  class="text-neutral-500 text-[10px]"
                >
                  ({{ item.childCount }} children)
                </span>
              </div>
              <p
                v-if="item.description"
                class="text-neutral-500 truncate"
                :title="item.description"
              >
                {{ item.description }}
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>

    <!-- Footer buttons -->
    <div class="flex items-center gap-2 pt-1">
      <button
        type="button"
        :disabled="importing || totalSelected === 0"
        :class="[
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          importing || totalSelected === 0
            ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-500 text-white',
        ]"
        @click="emit('confirm')"
      >
        {{ importing ? 'Importing...' : `Import Selected (${totalSelected})` }}
      </button>
      <button
        type="button"
        :disabled="importing"
        class="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40 disabled:cursor-not-allowed"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Zap,
  MessageSquare,
  GitBranch,
  Library,
  StickyNote,
  ChevronRight,
  ChevronDown,
} from 'lucide-vue-next'
import type { SetupPackPreview, SetupPackType } from '@app/api'

const props = defineProps<{
  preview: SetupPackPreview
  selection: Record<SetupPackType, string[]>
  expanded: Record<SetupPackType, boolean>
  importing: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-expand', key: SetupPackType): void
  (e: 'toggle-type-all', key: SetupPackType): void
  (e: 'toggle-item', payload: { key: SetupPackType; item: string }): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

interface Row {
  key: SetupPackType
  label: string
  icon: any
  totalCount: number
  selectedCount: number
  allSelected: boolean
  indeterminate: boolean
  isEmpty: boolean
  missing: boolean
}

const TYPE_META: { key: SetupPackType; label: string; icon: any }[] = [
  { key: 'actions', label: 'Actions', icon: Zap },
  { key: 'prompts', label: 'Prompts', icon: MessageSquare },
  { key: 'flows', label: 'Flows', icon: GitBranch },
  { key: 'library', label: 'Library', icon: Library },
  { key: 'notes', label: 'Notes', icon: StickyNote },
]

const rows = computed<Row[]>(() =>
  TYPE_META.map(meta => {
    const items = props.preview[meta.key]
    const missing = props.preview.missing?.includes(meta.key) ?? false
    const totalCount = items.length
    const selectedCount = props.selection[meta.key].length
    return {
      key: meta.key,
      label: meta.label,
      icon: meta.icon,
      totalCount,
      selectedCount,
      allSelected: totalCount > 0 && selectedCount === totalCount,
      indeterminate: selectedCount > 0 && selectedCount < totalCount,
      isEmpty: missing || totalCount === 0,
      missing,
    }
  }),
)

const totalSelected = computed(() =>
  rows.value.reduce((acc, r) => acc + r.selectedCount, 0),
)
</script>
