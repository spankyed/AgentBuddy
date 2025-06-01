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
    class="relative w-1/2"
    v-model="values"
    :open="isOpen"
    @update:open="isOpen = $event"
  >
    <ComboboxAnchor class="w-full">
      <ComboboxTrigger as-child>
        <div class="inline-flex items-center justify-between rounded-lg data-[open=true]:rounded-b-none p-2 text-[13px] leading-none gap-[5px] bg-neutral-900/60 text-neutral-200 shadow-[0_2px_10px] shadow-black/10 data-[placeholder]:text-neutral-400 outline-none w-full" :data-open="isOpen">
          <TagsInputRoot
            delimiter=""
            class="flex flex-wrap items-center gap-2 rounded-lg"
          >
            <TagsInputItem
              v-for="item in values"
              :key="item.id"
              :value="item"
              class="flex items-center justify-center gap-2 text-neutral-200  bg-purple-900/60 aria-[current=true]:bg-neutral-700 rounded px-2 py-1"
            >
              <TagsInputItemText class="text-sm">
                {{ item.name }}
              </TagsInputItemText>
              <TagsInputItemDelete
                @click="values = values.filter((v) => v.id !== item.id)"
              >
                <X :size="16" />
              </TagsInputItemDelete>
            </TagsInputItem>

            <ComboboxInput
              v-model="query"
              as-child
            >
              <TagsInputInput
                placeholder="Add tag..."
                class="focus:outline-none flex-1 rounded !bg-transparent placeholder:text-neutral-500 p-1"
                @keydown.enter.prevent
              />
            </ComboboxInput>
          </TagsInputRoot>

          <ChevronDown
            :size="16"
            class="text-neutral-400"
          />
        </div>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxContent v-if="filteredOptions.length" class="absolute z-10 w-full mt-0 bg-neutral-800 overflow-hidden rounded rounded-t-none shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade">
      <ComboboxViewport class="p-[5px] bg-neutral-900/60">
        <ComboboxGroup>
          <ComboboxItem
            v-for="(option, index) in filteredOptions"
            :key="option.id"
            class="text-[13px] leading-none text-neutral-200 rounded-[3px] flex items-center h-[25px] pr-[35px] pl-[25px] relative select-none data-[disabled]:text-neutral-600 data-[disabled]:pointer-events-none data-[highlighted]:outline-none data-[highlighted]:bg-purple-900/40 data-[highlighted]:text-neutral-100"
            :value="option"
          >
            <ComboboxItemIndicator
              class="absolute left-0 w-[25px] inline-flex items-center justify-center"
            >
              <X :size="16" />
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
