<template>
  <div class="emoji-picker relative">
    <slot :toggle="toggle" />

    <Transition name="picker">
      <div
        v-if="showPicker"
        class="absolute z-50 mt-1 p-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl w-72"
      >
        <div class="grid grid-cols-8 gap-0.5 mb-2 max-h-52 overflow-y-auto pr-0.5">
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
  // Documents & office
  '📄', '📝', '📓', '📖', '📚', '📑', '📋', '📂',
  '📁', '🗂️', '📰', '🗒️', '📃', '📜', '🔖', '🏷️',
  '✏️', '🖊️', '🖋️', '📎', '📌', '📍', '✂️', '🗑️',
  // Stars, hearts & symbols
  '⭐', '💡', '🔥', '❤️', '🎯', '🚀', '🔑', '🔒',
  '✅', '❌', '⚠️', '🚧', '📦', '🔧', '⚙️', '🔍',
  '🌟', '💎', '🏆', '🎖️', '🥇', '💯', '✨', '💫',
  '🔓', '♻️', '🔄', '➡️', '⬆️', '⬇️', '↩️', '🔀',
  // Hearts
  '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💝',
  // Faces & emotions
  '😊', '😎', '🥳', '😂', '🥰', '😇', '🤩', '😤',
  '😱', '🤯', '😴', '🤮', '😈', '👻', '💀', '🤖',
  '👽', '🎃', '😷', '🤓', '🧐', '😡', '🥺', '😬',
  // Hands & gestures
  '👍', '👎', '👋', '✋', '🤝', '👏', '🙏', '✌️',
  '🤞', '🤙', '👆', '👇', '👈', '👉', '☝️', '🫶',
  // People
  '🧑‍💻', '👤', '👥', '💪', '🧠', '👀', '🤔', '🙌',
  '👨‍🔬', '👩‍🎨', '👨‍🏫', '👩‍🚀', '🧑‍🔧', '👩‍💼', '🧑‍🍳', '💃',
  // Nature & weather
  '🌈', '🌿', '🌻', '🌍', '⚡', '☀️', '🌙', '⛅',
  '🌊', '❄️', '🍀', '🌸', '🌺', '🌲', '🍂', '🌵',
  '🌎', '🌏', '🌋', '🌄', '🌅', '🌌', '☁️', '🌧️',
  '⛈️', '🌪️', '🌫️', '☔', '🌤️', '🌥️', '💧', '🔆',
  // Plants
  '🌱', '🌳', '🌴', '🍁', '🌷', '🌹', '🪷', '💐',
  // Animals
  '🐱', '🐶', '🦊', '🐻', '🐼', '🦁', '🐸', '🦋',
  '🐝', '🐢', '🦄', '🐙', '🦅', '🐧', '🐳', '🦉',
  '🐺', '🦈', '🐬', '🐍', '🦎', '🐞', '🕷️', '🦀',
  '🐠', '🐡', '🦑', '🦐', '🐾', '🐔', '🦆', '🦩',
  // Food & drink
  '☕', '🍕', '🍎', '🍋', '🍓', '🍩', '🧁', '🍺',
  '🍔', '🌮', '🍣', '🍱', '🥗', '🍜', '🧇', '🥐',
  '🍪', '🎂', '🍰', '🍫', '🍿', '🥤', '🧃', '🍷',
  '🥑', '🍇', '🍌', '🥕', '🌽', '🍉', '🫐', '🥭',
  // Communication & tech
  '💬', '📧', '📱', '💻', '🖥️', '🌐', '📡', '🔗',
  '📮', '📞', '🎙️', '📺', '🔔', '📣', '🗣️', '💭',
  '🛜', '💾', '📀', '🖨️', '⌨️', '🖱️', '🔋', '🪫',
  // Arts & media
  '🎨', '🎵', '📷', '🎬', '🎭', '🎤', '🎧', '🎹',
  '🎸', '🎺', '🥁', '🎻', '📸', '🎞️', '📹', '🎶',
  // Activities & sports
  '🎮', '🧩', '🎲', '♟️', '🏀', '⚽', '🎾', '🏋️',
  '🏈', '⚾', '🏓', '🎳', '🏊', '🚴', '🧗', '🏄',
  '🎣', '🎪', '🎢', '🎡', '🏇', '⛷️', '🛹', '🤺',
  // Business & data
  '📈', '📊', '📉', '💰', '💳', '🏦', '📐', '🧮',
  '💵', '💴', '💶', '💷', '💸', '🪙', '💹', '🧾',
  // Travel & places
  '🏠', '🏢', '🏗️', '🗺️', '🧭', '✈️', '🚂', '🚗',
  '🚌', '🚁', '🛥️', '🚲', '🏍️', '🚕', '🚃', '⛵',
  '🗼', '🗽', '🏰', '🏛️', '⛩️', '🕌', '🕍', '⛪',
  // Science & medical
  '🧪', '🔬', '🔭', '💊', '🩺', '🧬', '🦠', '⚗️',
  // Time
  '⏰', '📅', '🗓️', '⏳', '⌛', '🕐', '🕑', '🕒',
  // Misc objects
  '🎁', '🧲', '🔮', '🛡️', '⚖️', '🪄', '🪴', '🕯️',
  '🧰', '🔩', '⛏️', '🪛', '🔨', '🪚', '🧱', '🪜',
  '🎀', '🎈', '🎉', '🎊', '🪅', '🎏', '🎐', '🧧',
  '🔦', '🏮', '💡', '🪞', '🪟', '🛏️', '🛋️', '🪑',
  '🧳', '👓', '🕶️', '👑', '🎩', '🧢', '💍', '👟',
  // Flags & symbols
  '🏁', '🚩', '🏳️', '🏴', '🎌', '⚜️', '♾️', '🔱',
  '⭕', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫',
  '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '▪️', '▫️',
  '♠️', '♥️', '♦️', '♣️', '🃏', '🀄', '☯️', '🔯',
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
