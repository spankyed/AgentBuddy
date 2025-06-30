<template>
  <div class="min-w-full">
    <table class="min-w-full divide-y divide-neutral-700">
      <thead class="sticky top-0 bg-neutral-950/40">
        <tr>
          <th class="px-4 py-2 text-xs font-medium tracking-wider text-left uppercase text-neutral-400">
            Value
          </th>
        </tr>
      </thead>
      <tbody class="divide-y bg-neutral-800 divide-neutral-700">
        <tr
          v-for="(value, index) in values"
          :key="index"
          class="hover:bg-neutral-900"
        >
          <td class="px-4 py-2 text-sm text-neutral-100">
            <div class="font-mono" :title="String(value)">
              {{ value }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
interface Props {
  values: any[];
}

defineProps<Props>();
</script> 