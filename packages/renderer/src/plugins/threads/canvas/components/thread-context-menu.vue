<template>
  <ContextMenuPortal>
    <ContextMenuContent
      class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[160px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)] z-50"
      :side-offset="2"
    >
      <slot name="before" :item-class="itemClass" />

      <ContextMenuItem :class="itemClass" @select="$emit('rename')">
        <Pencil :size="14" class="text-neutral-400" />
        Rename
      </ContextMenuItem>

      <ContextMenuItem :class="itemClass" @select="handleCopyId">
        <Copy :size="14" class="text-neutral-400" />
        Copy Id
      </ContextMenuItem>

      <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />

      <ContextMenuItem v-if="isPinned" :class="itemClass" @select="$emit('unpin')">
        <Pin :size="14" class="text-neutral-400" />
        Unpin
      </ContextMenuItem>
      <ContextMenuItem v-else :class="itemClass" @select="$emit('pin')">
        <Pin :size="14" class="text-neutral-400" />
        Pin
      </ContextMenuItem>
      <ContextMenuItem v-if="isArchived" :class="itemClass" @select="$emit('unarchive')">
        <ArchiveRestore :size="14" class="text-amber-400" />
        Unarchive
      </ContextMenuItem>
      <ContextMenuItem v-else-if="!isPinned" :class="itemClass" @select="$emit('archive')">
        <Archive :size="14" class="text-amber-400" />
        Archive
      </ContextMenuItem>

      <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />
      <ContextMenuItem
        class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-red-400 hover:bg-neutral-700 transition-colors outline-none"
        @select="$emit('delete')"
      >
        <Trash2 :size="14" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenuPortal>
</template>

<script setup lang="ts">
import { Archive, ArchiveRestore, Copy, Pencil, Pin, Trash2 } from 'lucide-vue-next';
import {
  ContextMenuPortal, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator,
} from 'reka-ui';

const props = defineProps<{
  isPinned: boolean;
  isArchived: boolean;
  copyText: string;
}>();

defineEmits<{
  rename: [];
  pin: [];
  unpin: [];
  archive: [];
  unarchive: [];
  delete: [];
}>();

const itemClass = 'flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none';

function handleCopyId() {
  navigator.clipboard.writeText(props.copyText);
}
</script>
