<template>
  <div class="emoji-picker relative">
    <slot :toggle="toggle" />

    <Transition name="picker">
      <div
        v-if="showPicker"
        class="absolute z-50 mt-1 p-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl w-64"
      >
        <div class="grid grid-cols-8 gap-0.5 mb-2">
          <button
            v-for="emoji in emojis"
            :key="emoji"
            @click="selectEmoji(emoji)"
            class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-700 transition-colors text-base"
            :class="modelValue === emoji ? 'bg-neutral-600 ring-1 ring-neutral-500' : ''"
          >
            {{ emoji }}
          </button>
        </div>

        <div class="pt-1.5 border-t border-neutral-700">
          <button
            @click="clearEmoji"
            class="w-full px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors text-left"
          >
            Remove icon
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Props {
  modelValue?: string | null
}

withDefaults(defineProps<Props>(), {
  modelValue: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const showPicker = ref(false)

const emojis = [
  '\ud83d\udcc4', '\ud83d\udcdd', '\ud83d\udcd3', '\ud83d\udcd6', '\ud83d\udcda', '\ud83d\udcd1', '\ud83d\udccb', '\ud83d\udcc2',
  '\u2b50', '\ud83d\udca1', '\ud83d\udd25', '\u2764\ufe0f', '\ud83c\udfaf', '\ud83d\ude80', '\ud83d\udd11', '\ud83d\udd12',
  '\u2705', '\u274c', '\u26a0\ufe0f', '\ud83d\udea7', '\ud83d\udce6', '\ud83d\udd27', '\u2699\ufe0f', '\ud83d\udd0d',
  '\ud83c\udf1f', '\ud83c\udf08', '\ud83c\udf3f', '\ud83c\udf3b', '\ud83c\udf0d', '\u26a1', '\ud83d\udcac', '\ud83d\udce7',
  '\ud83c\udfa8', '\ud83c\udfb5', '\ud83d\udcf7', '\ud83c\udfae', '\ud83e\udde9', '\ud83e\uddd1\u200d\ud83d\udcbb', '\ud83d\udcc8', '\ud83d\udcca',
]

function toggle() {
  showPicker.value = !showPicker.value
}

function selectEmoji(emoji: string) {
  emit('update:modelValue', emoji)
  showPicker.value = false
}

function clearEmoji() {
  emit('update:modelValue', null)
  showPicker.value = false
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.emoji-picker')) {
    showPicker.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.picker-enter-active,
.picker-leave-active {
  transition: all 0.2s ease;
}

.picker-enter-from,
.picker-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
