<template>
  <div class="min-w-full">
    <table class="min-w-full divide-y divide-neutral-800">
      <thead class="sticky top-0 z-10 bg-neutral-900">
        <tr>
          <th
            v-for="header in headers"
            :key="header"
            class="px-4 py-2 text-xs font-medium tracking-wider text-left uppercase bg-neutral-900 text-neutral-400"
          >
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y bg-neutral-800/20 divide-neutral-800">
        <ContextMenuRoot v-for="(row, index) in rows" :key="index">
          <ContextMenuTrigger as-child>
            <tr
              @dblclick="copyRowAsJson(row, index)"
              class="cursor-pointer hover:bg-neutral-700/30 relative"
            >
              <td
                v-for="header in headers"
                :key="header"
                class="px-4 py-2 text-sm text-neutral-100"
              >
                <JsonHoverPopup
                  v-if="isJsonLike(row[header])"
                  :value="row[header]"
                >
                  <div class="max-w-xs truncate cursor-default">
                    {{ formatCellValue(row[header]) }}
                  </div>
                </JsonHoverPopup>
                <div
                  v-else
                  class="max-w-xs truncate"
                  :title="formatCellValue(row[header])"
                >
                  {{ formatCellValue(row[header]) }}
                </div>
              </td>
              <div
                v-if="copiedRowIndex === index"
                class="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <div class="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1 flex items-center gap-1.5 shadow-sm">
                  <svg class="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                  </svg>
                  <span class="text-xs text-neutral-400">Copied</span>
                </div>
              </div>
            </tr>
          </ContextMenuTrigger>
          
          <ContextMenuPortal>
            <ContextMenuContent
              class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
            >
              <ContextMenuItem
                @select="copyRowAsJson(row, index)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Copy class="w-4 h-4" />
                Copy as JSON
              </ContextMenuItem>
              
              <ContextMenuItem
                v-if="getEntityId(row)"
                @select="copyEntityId(row)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Hash class="w-4 h-4" />
                Copy Entity ID
              </ContextMenuItem>
              
              <ContextMenuSeparator v-if="getEntityId(row)" class="h-px my-1 bg-neutral-700" />
              
              <ContextMenuItem
                v-if="getEntityId(row)"
                @select="handleDelete(row)"
                class="flex items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors cursor-pointer hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Trash2 class="w-4 h-4" />
                Delete Entity
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenuRoot>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Copy, Trash2, Hash } from 'lucide-vue-next';
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
} from 'reka-ui';
import JsonHoverPopup from '@/core/components/JsonHoverPopup.vue';
import { isJsonLike } from '../utils/json-detection';

interface Props {
  headers: string[];
  rows: Record<string, any>[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  delete: [entityId: string]
}>();

const copiedRowIndex = ref<number | null>(null);
let notificationTimeout: NodeJS.Timeout | undefined;

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getEntityId(row: Record<string, any>): string | null {
  // Check for 'id' field which should contain the entity ID
  if (row.id && typeof row.id === 'string' && row.id.includes('-')) {
    return row.id;
  }
  return null;
}

async function copyRowAsJson(row: Record<string, any>, index: number) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    
    // Show notification for this specific row
    copiedRowIndex.value = index;
    
    // Clear any existing timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }
    
    // Hide notification after 1.5 seconds
    notificationTimeout = setTimeout(() => {
      copiedRowIndex.value = null;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy row data:', err);
  }
}

async function copyEntityId(row: Record<string, any>) {
  const entityId = getEntityId(row);
  if (entityId) {
    try {
      await navigator.clipboard.writeText(entityId);
    } catch (err) {
      console.error('Failed to copy entity ID:', err);
    }
  }
}

function handleDelete(row: Record<string, any>) {
  const entityId = getEntityId(row);
  if (entityId) {
    if (confirm(`Are you sure you want to delete entity ${entityId}?`)) {
      emit('delete', entityId);
    }
  }
}
</script> 