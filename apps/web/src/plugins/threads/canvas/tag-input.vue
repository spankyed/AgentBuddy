<script setup lang="ts">
import { ComboboxAnchor, ComboboxContent, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxLabel, ComboboxRoot, ComboboxTrigger, ComboboxViewport, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText, TagsInputRoot, useFilter } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { X, ChevronDown } from 'lucide-vue-next'
import type { ThreadTagItem } from '@abuddy/api';

const isOpen = ref(false)

const props = defineProps<{
  modelValue: ThreadTagItem[];
  availableTags: ThreadTagItem[];
}>()
const emit = defineEmits<(e: 'update:modelValue', value: ThreadTagItem[]) => void>()

const { startsWith } = useFilter({ sensitivity: 'base' })
const query = ref('')
const values = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

watch(values, () => {
  console.log('values', values.value)
  query.value = ''
}, { deep: true })

const filteredOptions = computed(() =>
  props.availableTags
    .filter(option =>
      startsWith(option.name, query.value) && !values.value.find(item => item.id === option.id))
    .map(option => ({
      id: option.id,
      name: option.name,
    }))
)
</script>

<template>
  <ComboboxRoot
    multiple
    ignore-filter
    class="relative w-full"
    v-model="values"
    :open="isOpen"
    @update:open="isOpen = $event"
  >
    <ComboboxAnchor class="w-full">
      <ComboboxTrigger as-child>
        <!-- <div class="shadow-[0_2px_10px] shadow-black/10"></div> -->
        <div class="inline-flex items-center justify-between rounded-md data-[open=true]:rounded-b-none px-3 py-2 text-sm leading-none gap-2 bg-neutral-800 border border-neutral-700 text-neutral-200 data-[placeholder]:text-neutral-600 outline-none w-full hover:border-neutral-600 focus-within:border-neutral-600 transition-all duration-200" :data-open="isOpen">
          <TagsInputRoot
            delimiter=""
            class="flex flex-wrap items-center gap-2"
          >
            <TagsInputItem
              v-for="item in values"
              :key="item.id"
              :value="item"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 aria-[current=true]:bg-purple-500/20 transition-colors"
            >
              <TagsInputItemText class="text-xs">
                {{ item.name }}
              </TagsInputItemText>
              <TagsInputItemDelete
                @click.stop="values = values.filter((v) => v.id !== item.id)"
              >
                <X :size="14" class="hover:text-purple-300" />
              </TagsInputItemDelete>
            </TagsInputItem>

            <ComboboxInput
              v-model="query"
              as-child
            >
              <TagsInputInput
                placeholder="Add tag..."
                class="focus:outline-none flex-1 !bg-transparent placeholder:text-neutral-600 px-1 py-0.5 text-sm"
                @keydown.enter.prevent
              />
            </ComboboxInput>
          </TagsInputRoot>

          <ChevronDown
            :size="16"
            class="text-neutral-500 transition-transform data-[state=open]:rotate-180" :data-state="isOpen ? 'open' : 'closed'"
          />
        </div>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxContent v-if="filteredOptions.length" class="absolute z-10 w-full mt-1 bg-neutral-800 border border-neutral-700 overflow-hidden rounded-md shadow-lg">
      <ComboboxViewport class="p-2">
        <ComboboxGroup>
          <ComboboxItem
            v-for="(option, index) in filteredOptions"
            :key="option.id"
            class="text-sm leading-none text-neutral-200 rounded flex items-center px-3 py-2 relative select-none data-[disabled]:text-neutral-600 data-[disabled]:pointer-events-none data-[highlighted]:outline-none data-[highlighted]:bg-neutral-700 data-[highlighted]:text-neutral-100 hover:bg-neutral-700 transition-colors cursor-pointer"
            :value="option"
          >
            <ComboboxItemIndicator
              class="absolute left-2 inline-flex items-center justify-center opacity-0 data-[state=checked]:opacity-100"
            >
              <div class="w-1.5 h-1.5 rounded-full bg-purple-400" />
            </ComboboxItemIndicator>
            <span>
              {{ option.name }}
            </span>
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>
</template>
