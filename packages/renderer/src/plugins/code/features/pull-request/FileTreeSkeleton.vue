<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <!-- Skeleton header -->
    <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-neutral-800">
      <div class="w-3 h-3 rounded-sm bg-neutral-700/60 animate-pulse" />
      <div class="h-2.5 w-14 rounded-sm bg-neutral-700/60 animate-pulse" />
      <div class="w-2 h-2 rounded-sm bg-neutral-700/40 animate-pulse mx-0.5" />
      <div class="h-2.5 w-10 rounded-sm bg-neutral-700/40 animate-pulse" />
    </div>
    <!-- Skeleton file tree -->
    <div class="py-1">
      <div v-for="row in rows" :key="row.key" class="flex items-center gap-2 px-2 h-7" :style="{ paddingLeft: `${row.padLeft}px` }">
        <!-- Folder: chevron + folder icon -->
        <template v-if="row.isFolder">
          <div class="w-3 h-3 rounded-sm bg-neutral-700/50 animate-pulse shrink-0" />
          <div class="w-4 h-4 rounded-sm bg-neutral-700/50 animate-pulse shrink-0" />
        </template>
        <!-- File: file icon (padLeft already accounts for chevron space) -->
        <template v-else>
          <div class="w-4 h-4 rounded-sm bg-neutral-700/40 animate-pulse shrink-0" />
        </template>
        <div class="h-2.5 rounded-sm bg-neutral-700/50 animate-pulse" :style="{ width: `${row.width}px` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Matches FileTreeItem indentation: folder=(level*16)+8, file=(level*16)+8+20
// padLeft includes the base px-2 (8px) since inline paddingLeft overrides it
const rows = [
  { key: 'f1', isFolder: true, padLeft: 16, width: 72 },
  { key: 'a1', isFolder: false, padLeft: 36, width: 96 },
  { key: 'a2', isFolder: false, padLeft: 36, width: 64 },
  { key: 'f2', isFolder: true, padLeft: 16, width: 88 },
  { key: 'b1', isFolder: false, padLeft: 36, width: 108 },
  { key: 'b2', isFolder: false, padLeft: 36, width: 76 },
  { key: 'c1', isFolder: false, padLeft: 36, width: 84 },
]
</script>
