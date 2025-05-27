<template>
  <div v-if="totalPages > 1" class="flex justify-center">
    <PaginationRoot
      :page="currentPage"
      :itemsPerPage="itemsPerPage"
      :total="total"
      :siblingCount="siblingCount"
      show-edges
      @update:page="handlePageChange"
    >
      <PaginationList v-slot="{ items }" class="flex items-center gap-1 text-white">
        <PaginationFirst class="flex items-center justify-center transition bg-transparent rounded-lg w-9 h-9 hover:bg-neutral-700/40 disabled:opacity-30" :disabled="isDisabled || currentPage === 1">
          <ChevronsRight class="rotate-180" :size="16" />
        </PaginationFirst>
        <PaginationPrev class="flex items-center justify-center mr-4 transition bg-transparent rounded-lg w-9 h-9 hover:bg-neutral-700/40 disabled:opacity-30" :disabled="isDisabled || currentPage === 1">
          <ChevronRight class="rotate-180" :size="16" />
        </PaginationPrev>
        
        <template v-for="(page, index) in items">
          <PaginationListItem
            v-if="page.type === 'page'"
            :key="index"
            class="w-9 h-9 border border-neutral-700/60 rounded-lg data-[selected]:!bg-neutral-700 data-[selected]:shadow-sm data-[selected]:text-white hover:bg-neutral-700/40 transition"
            :value="page.value"
            :disabled="isDisabled"
          >
            {{ page.value }}
          </PaginationListItem>
          <PaginationEllipsis
            v-else
            :key="page.type"
            :index="index"
            class="flex items-center justify-center w-9 h-9"
          >
            &#8230;
          </PaginationEllipsis>
        </template>
        
        <PaginationNext class="flex items-center justify-center ml-4 transition bg-transparent rounded-lg w-9 h-9 hover:bg-neutral-700/40 disabled:opacity-30" :disabled="isDisabled || currentPage === totalPages">
          <ChevronRight :size="16" />
        </PaginationNext>
        <PaginationLast class="flex items-center justify-center transition bg-transparent rounded-lg w-9 h-9 hover:bg-neutral-700/40 disabled:opacity-30" :disabled="isDisabled || currentPage === totalPages">
          <ChevronsRight :size="16" />
        </PaginationLast>
      </PaginationList>
    </PaginationRoot>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, ChevronsRight } from 'lucide-vue-next'
import {
  PaginationRoot, PaginationList, PaginationListItem,
  PaginationEllipsis, PaginationFirst, PaginationLast,
  PaginationNext, PaginationPrev
} from 'reka-ui'

const props = withDefaults(defineProps<{
  total: number
  defaultPage?: number
  disabled?: boolean
  itemsPerPage?: number
  siblingCount?: number
}>(), {
  defaultPage: 1,
  disabled: false,
  itemsPerPage: 6,
  siblingCount: 1
})

const emit = defineEmits<{
  'page-changed': [page: number]
}>()

const currentPage = ref(props.defaultPage)
const isDisabled = computed(() => props.disabled)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / props.itemsPerPage))
)

function handlePageChange(newPage: number) {
  if (props.disabled) return
  currentPage.value = newPage
  emit('page-changed', newPage)
}
</script>
