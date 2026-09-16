<template>
  <div class="max-w-4xl">
    <div class="rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <div class="flex items-center justify-between px-4 pt-3">
        <span class="text-xs text-neutral-500">
          {{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}
        </span>
        <CopyButton :text="copyText" />
      </div>

      <div v-if="columns.length === 0" class="px-6 pb-6 text-sm text-neutral-500">
        No tabular data in this artifact.
      </div>

      <div v-else class="px-4 pb-4 overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-neutral-700">
              <th
                v-for="column in columns"
                :key="column"
                class="px-3 py-2 font-medium text-left text-neutral-400 whitespace-nowrap"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="index"
              class="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/40"
            >
              <td
                v-for="column in columns"
                :key="column"
                class="px-3 py-2 align-top text-neutral-200"
              >
                {{ formatCell(row[column]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ArtifactItem } from '@abuddy/sdk/artifacts';
import CopyButton from '@abuddy/ui/design/CopyButton';

/**
 * A table artifact's content is either a list of row objects, or an explicit
 * `{ columns, rows }` where each row is an array of cells in column order.
 */
type TableContent =
  | Array<Record<string, unknown>>
  | { columns: string[]; rows: unknown[][] };

const props = defineProps<{
  artifact: ArtifactItem;
}>();

/** The content, parsed when it arrives as a JSON string */
const content = computed<unknown>(() => {
  const raw = props.artifact.content;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

const isColumnsAndRows = (value: unknown): value is { columns: string[]; rows: unknown[][] } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && Array.isArray((value as { columns?: unknown }).columns)
  && Array.isArray((value as { rows?: unknown }).rows);

/** Column names, in the order they first appear across the rows */
const columns = computed<string[]>(() => {
  const value = content.value as TableContent | null;
  if (isColumnsAndRows(value)) return value.columns.map(String);
  if (!Array.isArray(value)) return [];

  const seen: string[] = [];
  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue;
    for (const key of Object.keys(row)) {
      if (!seen.includes(key)) seen.push(key);
    }
  }
  return seen;
});

/** Rows keyed by column name, whichever shape the content arrived in */
const rows = computed<Array<Record<string, unknown>>>(() => {
  const value = content.value as TableContent | null;

  if (isColumnsAndRows(value)) {
    const names = value.columns.map(String);
    return value.rows.map((cells) =>
      Object.fromEntries(names.map((name, i) => [name, Array.isArray(cells) ? cells[i] : undefined])),
    );
  }

  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
});

/** Objects and arrays are shown as compact JSON; null and undefined as an em dash */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const copyText = computed(() =>
  typeof props.artifact.content === 'string'
    ? props.artifact.content
    : JSON.stringify(props.artifact.content, null, 2),
);
</script>
