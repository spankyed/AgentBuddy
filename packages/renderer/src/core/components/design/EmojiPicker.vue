<template>
  <div class="emoji-picker relative">
    <slot :toggle="toggle" />

    <Transition name="picker">
      <div
        v-if="showPicker"
        class="absolute z-50 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl w-80"
      >
        <!-- Search input -->
        <div class="p-2 pb-0">
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            placeholder="Search icons..."
            class="w-full px-2.5 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-md text-neutral-200 placeholder-neutral-500 outline-none focus:border-neutral-500 transition-colors"
            @click.stop
          />
        </div>

        <!-- Category tabs -->
        <div v-if="!searchQuery" class="flex gap-0.5 px-2 py-1.5 border-b border-neutral-700 overflow-x-auto no-scrollbar">
          <button
            v-for="cat in categories"
            :key="cat.id"
            @click.stop="scrollToCategory(cat.id)"
            class="w-6 h-6 flex items-center justify-center rounded text-sm hover:bg-neutral-700 transition-colors shrink-0"
            :class="activeCategory === cat.id ? 'bg-neutral-700' : ''"
            :title="cat.name"
          >
            {{ cat.icon }}
          </button>
        </div>

        <!-- Emoji grid -->
        <div ref="gridContainer" class="max-h-56 overflow-y-auto px-2 pb-1.5" @scroll="handleScroll">
          <template v-if="searchQuery">
            <div v-if="filteredEmojis.length" class="grid grid-cols-8 gap-0.5">
              <button
                v-for="emoji in filteredEmojis"
                :key="emoji"
                @click="selectEmoji(emoji)"
                class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-700 transition-colors text-base"
                :class="modelValue === emoji ? 'bg-neutral-600 ring-1 ring-neutral-500' : ''"
              >
                {{ emoji }}
              </button>
            </div>
            <div v-else class="py-4 text-xs text-neutral-500 text-center">No results</div>
          </template>
          <template v-else>
            <div v-for="cat in categories" :key="cat.id" :ref="el => setCategoryRef(cat.id, el)">
              <div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider px-0.5 py-1 sticky top-0 bg-neutral-800">
                {{ cat.name }}
              </div>
              <div class="grid grid-cols-8 gap-0.5 mb-1">
                <button
                  v-for="emoji in cat.emojis"
                  :key="emoji"
                  @click="selectEmoji(emoji)"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-700 transition-colors text-base"
                  :class="modelValue === emoji ? 'bg-neutral-600 ring-1 ring-neutral-500' : ''"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Remove icon -->
        <div class="px-2 pb-2">
          <div class="pt-1.5 border-t border-neutral-700">
            <button
              @click="clearEmoji"
              class="w-full px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors text-left"
            >
              Remove icon
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

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
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement>()
const gridContainer = ref<HTMLElement>()
const activeCategory = ref('docs')
const categoryRefs = new Map<string, Element>()

function setCategoryRef(id: string, el: any) {
  if (el) categoryRefs.set(id, el as Element)
  else categoryRefs.delete(id)
}

const categories = [
  {
    id: 'docs', icon: '📄', name: 'Documents & Office',
    emojis: [
      '📄', '📝', '📓', '📔', '📒', '📕', '📗', '📘',
      '📙', '📖', '📚', '📑', '📋', '📂', '📁', '🗂️',
      '📰', '🗒️', '📃', '📜', '🔖', '🏷️', '✏️', '🖊️',
      '🖋️', '📎', '📌', '📍', '✂️', '🗑️', '🖇️', '📏',
      '📐', '🗃️', '🗄️', '🗞️', '📇', '📊', '📈', '📉',
      '🖍️', '🖌️', '📒', '🗳️', '📮', '📥', '📤', '📫',
    ],
  },
  {
    id: 'symbols', icon: '⭐', name: 'Symbols & Status',
    emojis: [
      '⭐', '🌟', '✨', '💫', '💎', '🏆', '🎖️', '🥇',
      '🥈', '🥉', '💯', '✅', '❌', '⚠️', '🚧', '⛔',
      '🚫', '❗', '❓', '❕', '❔', '‼️', '⁉️', '💢',
      '♻️', '🔄', '🔃', '➡️', '⬅️', '⬆️', '⬇️', '↩️',
      '↪️', '🔀', '🔁', '🔂', '▶️', '⏸️', '⏹️', '⏺️',
      '⏩', '⏪', '⏫', '⏬', '🔼', '🔽', '➕', '➖',
      '➗', '✖️', '♾️', '💲', '©️', '®️', '™️', '☑️',
      '🔘', '🔲', '🔳', '◼️', '◻️', '▪️', '▫️', '🔹',
      '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏',
      '♐', '♑', '♒', '♓', '⚜️', '🔱', '🔰', '⚕️',
      '⏭️', '⏮️', '🔍', '🔎', '📢', '🔢', '🔣', '🔤',
      '🔡', '🔠', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣',
      '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🆓',
    ],
  },
  {
    id: 'signs', icon: '🅰️', name: 'Signs & Labels',
    emojis: [
      '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '🆔', '🆕',
      '🆗', '🆙', '🆒', '🈁', '🈂️', '🈷️', '🈶', '🈯',
      '🚸', '🔞', '📵', '🚭', '🚯', '🚱', '🚳', '🛑',
      '⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️',
      '↕️', '↔️', '🔙', '🔚', '🔛', '🔜', '🔝', '🔃',
    ],
  },
  {
    id: 'hearts', icon: '❤️', name: 'Hearts & Love',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💝', '💘', '💖', '💗', '💓', '💞', '💕',
      '❤️‍🔥', '❤️‍🩹', '💟', '♥️', '💑', '💏', '💋', '😍',
    ],
  },
  {
    id: 'faces', icon: '😊', name: 'Faces & Emotions',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛',
      '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🫣',
      '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶',
      '🫥', '😏', '😒', '🙄', '😬', '🤥', '🫠', '😌',
      '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
      '🤮', '🥴', '😵', '😵‍💫', '🤯', '🥳', '🥸', '😎',
      '🤓', '🧐', '😕', '🫤', '😟', '🙁', '☹️', '😮',
      '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨',
      '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
      '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
      '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺',
      '👻', '👽', '👾', '🤖', '🎃', '😶‍🌫️', '😮‍💨', '🫶',
    ],
  },
  {
    id: 'people', icon: '👤', name: 'People & Gestures',
    emojis: [
      '👍', '👎', '👋', '✋', '🤝', '👏', '🙏', '✌️',
      '🤞', '🤙', '👆', '👇', '👈', '👉', '☝️', '🫶',
      '🤟', '🤘', '🫰', '🫵', '🫱', '🫲', '🫳', '🫴',
      '✊', '👊', '🤛', '🤜', '🤚', '👐', '🙌', '💪',
      '🤌', '🤏', '🖐️', '✍️', '👂', '👃', '🦷', '🦴',
      '🫀', '🫁', '🦶', '🦵', '👅', '👄', '🫦', '🦻',
      '🧑‍💻', '👤', '👥', '🧠', '👀', '👁️', '👶', '🧒',
      '👨‍🔬', '👩‍🎨', '👨‍🏫', '👩‍🚀', '🧑‍🔧', '👩‍💼', '🧑‍🍳', '👨‍⚕️',
      '👩‍🌾', '👨‍🎤', '👩‍💻', '🧑‍🎓', '👨‍🍳', '👩‍🔬', '🧑‍🚒', '👮',
      '👷', '💂', '🕵️', '🧑‍✈️', '🧑‍🦯', '🧑‍🦼', '🧑‍🦽', '🧙',
      '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '🦸', '🦹',
      '💃', '🕺', '🧎', '🧍', '🚶', '🏃', '🤸', '🤹',
      '👫', '👬', '👭', '🧑‍🤝‍🧑', '👪', '🫂', '💑', '💏',
    ],
  },
  {
    id: 'nature', icon: '🌿', name: 'Nature & Weather',
    emojis: [
      '🌈', '🌿', '🌻', '🌍', '🌎', '🌏', '⚡', '☀️',
      '🌙', '🌛', '🌜', '🌝', '🌞', '⭐', '⛅', '☁️',
      '🌧️', '⛈️', '🌪️', '🌫️', '☔', '🌤️', '🌥️', '🌦️',
      '🌊', '❄️', '☃️', '⛄', '💧', '💦', '🔆', '🌡️',
      '🌱', '🌳', '🌴', '🌲', '🌵', '🍀', '☘️', '🍃',
      '🍁', '🍂', '🌸', '🌺', '🌷', '🌹', '🪷', '💐',
      '🌼', '🪻', '🌾', '🪴', '🍄', '🪨', '🌋', '🏔️',
      '🌄', '🌅', '🌌', '🌠', '🌉', '⛰️', '🏜️', '🏞️',
      '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘',
      '🪐', '💫', '🌟', '⭐', '🌃', '🌆', '🌇', '🌁',
    ],
  },
  {
    id: 'animals', icon: '🐱', name: 'Animals',
    emojis: [
      '🐱', '🐶', '🦊', '🐻', '🐼', '🦁', '🐯', '🐮',
      '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🦋',
      '🐝', '🐢', '🦄', '🐙', '🦅', '🐧', '🐳', '🦉',
      '🐺', '🦈', '🐬', '🐍', '🦎', '🐞', '🕷️', '🦀',
      '🐠', '🐡', '🦑', '🦐', '🐾', '🐔', '🦆', '🦩',
      '🐰', '🐹', '🐭', '🐿️', '🦔', '🦇', '🐴', '🦓',
      '🦒', '🐘', '🦏', '🦛', '🐊', '🐋', '🐟', '🦭',
      '🐛', '🦗', '🐜', '🐌', '🦥', '🦦', '🦫', '🐄',
      '🐑', '🐐', '🐫', '🐪', '🦙', '🦘', '🐇', '🦨',
      '🦡', '🦃', '🐓', '🦜', '🦚', '🦢', '🪿', '🐦',
      '🐈', '🐕', '🦮', '🐕‍🦺', '🐩', '🐁', '🐀', '🦝',
      '🦧', '🦍', '🐂', '🐃', '🐏', '🦌', '🐖', '🦬',
    ],
  },
  {
    id: 'food', icon: '🍕', name: 'Food & Drink',
    emojis: [
      '☕', '🍕', '🍎', '🍋', '🍓', '🍩', '🧁', '🍺',
      '🍔', '🌮', '🌯', '🍣', '🍱', '🥗', '🍜', '🍝',
      '🧇', '🥐', '🥖', '🍞', '🥨', '🥯', '🧀', '🥚',
      '🍪', '🎂', '🍰', '🍫', '🍿', '🥤', '🧃', '🍷',
      '🥑', '🍇', '🍌', '🥕', '🌽', '🍉', '🫐', '🥭',
      '🍑', '🍒', '🍐', '🥝', '🍅', '🥦', '🧅', '🌶️',
      '🥩', '🍗', '🍖', '🥓', '🌭', '🍟', '🥪', '🫕',
      '🍦', '🧋', '🍵', '🥂', '🍻', '🥃', '🍾', '🫗',
      '🥥', '🫒', '🫑', '🥬', '🥒', '🧄', '🥜', '🌰',
      '🥞', '🧈', '🥙', '🧆', '🥘', '🫔', '🥧', '🍮',
      '🍭', '🍬', '🍡', '🍘', '🍙', '🍚', '🍛', '🍢',
      '🍤', '🍥', '🥮', '🥟', '🥠', '🥡', '🫘', '🧊',
    ],
  },
  {
    id: 'travel', icon: '🚗', name: 'Travel & Places',
    emojis: [
      '🏠', '🏡', '🏢', '🏗️', '🗺️', '🧭', '✈️', '🚂',
      '🚗', '🚌', '🚁', '🛥️', '🚲', '🏍️', '🚕', '🚃',
      '⛵', '🚤', '🛶', '🚀', '🛸', '🛩️', '🚅', '🚆',
      '🚇', '🚊', '🚉', '🚏', '🛣️', '🛤️', '⛽', '🚧',
      '🗼', '🗽', '🏰', '🏛️', '⛩️', '🕌', '🕍', '⛪',
      '🏟️', '🏪', '🏥', '🏫', '🏨', '🏦', '🏭', '🏬',
      '🗿', '🎪', '🎡', '🎢', '🎠', '⛲', '🌁', '🌃',
      '🏕️', '⛺', '🏖️', '🏝️', '🛖', '🛕', '⛰️', '🗻',
      '🚑', '🚒', '🚓', '🚔', '🚖', '🚘', '🚙', '🛻',
      '🚐', '🚎', '🛺', '🚜', '🛵', '🏎️', '🚄', '🚝',
    ],
  },
  {
    id: 'activities', icon: '🎮', name: 'Activities & Sports',
    emojis: [
      '🎮', '🧩', '🎲', '♟️', '🏀', '⚽', '🎾', '🏋️',
      '🏈', '⚾', '🏓', '🎳', '🏊', '🚴', '🧗', '🏄',
      '🎣', '🏇', '⛷️', '🛹', '🤺', '🏸', '🥊', '🥋',
      '⛳', '🏌️', '🤿', '🛷', '⛸️', '🥅', '🏒', '🥌',
      '🎯', '🪁', '🎱', '🔮', '🎰', '🎗️', '🎫', '🎟️',
      '🎪', '🤹', '🎭', '🎨', '🎵', '🎶', '🎤', '🎧',
      '🎹', '🎸', '🎺', '🥁', '🎻', '🪕', '🎷', '🪗',
      '📷', '📸', '🎬', '🎞️', '📹', '📺', '📻', '🎙️',
      '🥏', '🪀', '🪃', '🛹', '🛼', '🤼', '🤽', '🤾',
      '🧘', '🧖', '🛀', '🎿', '🏂', '🪂', '🏹', '🎽',
    ],
  },
  {
    id: 'tech', icon: '💻', name: 'Tech & Communication',
    emojis: [
      '💬', '📧', '📱', '💻', '🖥️', '🌐', '📡', '🔗',
      '📮', '📞', '📺', '🔔', '📣', '🗣️', '💭', '🛜',
      '💾', '📀', '💿', '🖨️', '⌨️', '🖱️', '🔋', '🪫',
      '🔌', '📟', '📠', '📲', '☎️', '📳', '📴', '📵',
      '🖲️', '🖥️', '📺', '📻', '🎚️', '🎛️', '🧑‍💻', '📡',
    ],
  },
  {
    id: 'objects', icon: '🔧', name: 'Objects & Tools',
    emojis: [
      '🔧', '🔨', '⛏️', '🪛', '🪚', '🔩', '🧰', '🪜',
      '🧱', '🪤', '🧲', '⚖️', '🛡️', '⚔️', '🗡️', '🔫',
      '🏹', '🪃', '🪓', '🔑', '🔒', '🔓', '🗝️', '🔐',
      '🧪', '🔬', '🔭', '💊', '🩺', '🧬', '🦠', '⚗️',
      '💉', '🩸', '🩻', '🩹', '🩼', '🪬', '🧿', '🪄',
      '🎁', '🎈', '🎉', '🎊', '🎀', '🧧', '🎏', '🎐',
      '🪅', '🪆', '🕯️', '🔦', '🏮', '🪞', '🪟', '🛋️',
      '🪑', '🛏️', '🧳', '👓', '🕶️', '👑', '🎩', '🧢',
      '💍', '👟', '👠', '👢', '🎒', '👜', '📿', '🪥',
      '🧴', '🧹', '🧺', '🧻', '🪣', '🧼', '🫧', '🪒',
      '🧽', '👔', '👕', '👖', '👗', '🧥', '🧦', '🧤',
      '🧣', '👘', '🥻', '🩱', '🩲', '🩳', '👙', '🩴',
      '🪖', '⛑️', '🎓', '💄', '🪮', '🛍️', '🧵', '🧶',
      '🪡', '🚿', '🪠', '🧯', '🪵', '🛒', '🚪', '🪤',
      '🛞', '🛟', '⚓', '🚢', '🛳️', '🚟', '🚠', '🚡',
    ],
  },
  {
    id: 'time', icon: '⏰', name: 'Time & Calendar',
    emojis: [
      '⏰', '📅', '🗓️', '⏳', '⌛', '🕐', '🕑', '🕒',
      '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚',
      '🕛', '⏱️', '⏲️', '🕰️', '📆', '🔔', '🔕', '🕜',
      '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤',
    ],
  },
  {
    id: 'money', icon: '💰', name: 'Business & Money',
    emojis: [
      '💰', '💳', '🏦', '🧮', '💵', '💴', '💶', '💷',
      '💸', '🪙', '💹', '🧾', '📊', '📈', '📉', '💼',
      '🏧', '💱', '🏪', '🏬', '🏭', '🏢', '📑', '📋',
    ],
  },
  {
    id: 'flags', icon: '🚩', name: 'Flags & Symbols',
    emojis: [
      '🏁', '🚩', '🏳️', '🏴', '🎌', '🏴‍☠️', '🏳️‍🌈', '🏳️‍⚧️',
      '♠️', '♥️', '♦️', '♣️', '🃏', '🀄', '☯️', '🔯',
      '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '☢️', '☣️',
      '⚛️', '🈳', '🈵', '🈴', '🈲', '🉐', '㊗️', '㊙️',
    ],
  },
  {
    id: 'colors', icon: '🔴', name: 'Colors & Shapes',
    emojis: [
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
      '🟤', '🔶', '🔷', '🔸', '🔹', '⭕', '🟥', '🟧',
      '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '💠',
      '🔺', '🔻', '🔘', '🔲', '🔳', '◼️', '◻️', '▪️',
      '▫️', '◾', '◽', '❤️', '🧡', '💛', '💚', '💙',
    ],
  },
  {
    id: 'countries', icon: '🌍', name: 'Country Flags',
    emojis: [
      // Americas
      '🇺🇸', '🇨🇦', '🇲🇽', '🇧🇷', '🇦🇷', '🇨🇴', '🇨🇱', '🇵🇪',
      '🇻🇪', '🇪🇨', '🇨🇺', '🇵🇷', '🇯🇲', '🇭🇹', '🇩🇴', '🇨🇷',
      '🇵🇦', '🇺🇾', '🇵🇾', '🇧🇴', '🇬🇹', '🇭🇳', '🇸🇻', '🇳🇮',
      // Europe
      '🇬🇧', '🇫🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇵🇹', '🇳🇱', '🇧🇪',
      '🇨🇭', '🇦🇹', '🇸🇪', '🇳🇴', '🇩🇰', '🇫🇮', '🇮🇸', '🇮🇪',
      '🇵🇱', '🇨🇿', '🇷🇴', '🇭🇺', '🇬🇷', '🇭🇷', '🇷🇸', '🇧🇬',
      '🇸🇰', '🇸🇮', '🇱🇹', '🇱🇻', '🇪🇪', '🇺🇦', '🇲🇩', '🇧🇾',
      '🇦🇱', '🇲🇰', '🇲🇪', '🇽🇰', '🇧🇦', '🇱🇺', '🇲🇹', '🇨🇾',
      // Asia & Pacific
      '🇯🇵', '🇰🇷', '🇨🇳', '🇹🇼', '🇭🇰', '🇲🇴', '🇮🇳', '🇵🇰',
      '🇧🇩', '🇱🇰', '🇳🇵', '🇹🇭', '🇻🇳', '🇮🇩', '🇲🇾', '🇸🇬',
      '🇵🇭', '🇲🇲', '🇰🇭', '🇱🇦', '🇲🇳', '🇰🇿', '🇺🇿', '🇦🇿',
      '🇬🇪', '🇦🇲', '🇮🇱', '🇵🇸', '🇱🇧', '🇯🇴', '🇸🇦', '🇦🇪',
      '🇶🇦', '🇰🇼', '🇧🇭', '🇴🇲', '🇮🇶', '🇮🇷', '🇹🇷', '🇾🇪',
      '🇦🇫', '🇸🇾', '🇰🇬', '🇹🇯', '🇹🇲', '🇧🇳', '🇹🇱', '🇫🇯',
      // Oceania
      '🇦🇺', '🇳🇿', '🇵🇬', '🇼🇸', '🇹🇴', '🇻🇺', '🇸🇧', '🇰🇮',
      // Africa
      '🇿🇦', '🇳🇬', '🇪🇬', '🇰🇪', '🇪🇹', '🇬🇭', '🇹🇿', '🇺🇬',
      '🇩🇿', '🇲🇦', '🇹🇳', '🇱🇾', '🇸🇩', '🇸🇸', '🇸🇳', '🇨🇲',
      '🇨🇮', '🇲🇱', '🇧🇫', '🇳🇪', '🇹🇩', '🇨🇬', '🇨🇩', '🇦🇴',
      '🇲🇿', '🇿🇼', '🇧🇼', '🇳🇦', '🇿🇲', '🇲🇼', '🇲🇬', '🇲🇺',
      '🇷🇼', '🇧🇮', '🇩🇯', '🇪🇷', '🇸🇴', '🇬🇦', '🇬🇶', '🇱🇸',
    ],
  },
]

// Keyword map for search
const emojiKeywords: Record<string, string> = {
  // Documents
  '📄': 'document page file paper blank',
  '📝': 'memo note write edit pencil',
  '📓': 'notebook journal diary',
  '📔': 'notebook decorated journal',
  '📒': 'ledger notebook yellow',
  '📕': 'book red closed',
  '📗': 'book green',
  '📘': 'book blue',
  '📙': 'book orange',
  '📖': 'book open read',
  '📚': 'books stack library reading',
  '📑': 'bookmark tabs',
  '📋': 'clipboard list',
  '📂': 'folder open directory',
  '📁': 'folder closed directory',
  '🗂️': 'dividers index card file tabs',
  '📰': 'newspaper news press article',
  '🗒️': 'notepad spiral pad',
  '📃': 'page curl document',
  '📜': 'scroll parchment ancient',
  '🔖': 'bookmark mark tag',
  '🏷️': 'label tag price',
  '✏️': 'pencil write edit draw',
  '🖊️': 'pen write ink',
  '🖋️': 'fountain pen write ink',
  '📎': 'paperclip attach clip',
  '📌': 'pin pushpin tack',
  '📍': 'pin round location',
  '✂️': 'scissors cut trim',
  '🗑️': 'trash bin delete waste garbage',
  '🖇️': 'paperclips linked attach',
  '📏': 'ruler straight measure',
  '📐': 'ruler triangle measure angle',
  '🗃️': 'card file box index',
  '🗄️': 'cabinet file storage',
  '🗞️': 'newspaper rolled press',
  '📇': 'card index rolodex',
  '📊': 'chart bar graph statistics data',
  '📈': 'chart increasing graph up trend',
  '📉': 'chart decreasing graph down trend',

  // Symbols & Status
  '⭐': 'star favorite bookmark gold',
  '🌟': 'star glowing bright shine',
  '✨': 'sparkle shine glitter new',
  '💫': 'dizzy star spin',
  '💎': 'gem diamond jewel precious',
  '🏆': 'trophy award win champion cup',
  '🎖️': 'medal military award honor',
  '🥇': 'gold medal first winner',
  '🥈': 'silver medal second',
  '🥉': 'bronze medal third',
  '💯': 'hundred perfect score',
  '✅': 'check done complete yes approve',
  '❌': 'cross delete remove no cancel wrong',
  '⚠️': 'warning caution alert danger',
  '🚧': 'construction wip building work progress',
  '⛔': 'prohibited stop banned forbidden',
  '🚫': 'prohibited no ban forbidden',
  '❗': 'exclamation important alert',
  '❓': 'question ask help',
  '❕': 'exclamation white',
  '❔': 'question white',
  '‼️': 'double exclamation important urgent',
  '⁉️': 'exclamation question',
  '💢': 'anger symbol angry',
  '♻️': 'recycle green reuse sustainable',
  '🔄': 'refresh reload sync update arrows',
  '🔃': 'arrows clockwise refresh',
  '➡️': 'arrow right forward next',
  '⬅️': 'arrow left back previous',
  '⬆️': 'arrow up top',
  '⬇️': 'arrow down bottom',
  '↩️': 'arrow return back undo',
  '↪️': 'arrow right return redo',
  '🔀': 'shuffle random mix',
  '🔁': 'repeat loop cycle',
  '🔂': 'repeat single once',
  '▶️': 'play start begin',
  '⏸️': 'pause break',
  '⏹️': 'stop end halt',
  '⏺️': 'record circle',
  '⏩': 'fast forward skip',
  '⏪': 'rewind backward',
  '⏫': 'fast up top',
  '⏬': 'fast down bottom',
  '🔼': 'up small triangle',
  '🔽': 'down small triangle',
  '➕': 'plus add new',
  '➖': 'minus remove subtract',
  '➗': 'divide split',
  '✖️': 'multiply times cross',
  '♾️': 'infinity forever loop eternal',
  '💲': 'dollar money currency',
  '©️': 'copyright',
  '®️': 'registered trademark',
  '™️': 'trademark brand',
  '☑️': 'checkbox check ballot done',

  // Hearts
  '❤️': 'heart red love',
  '🧡': 'heart orange love',
  '💛': 'heart yellow love',
  '💚': 'heart green love',
  '💙': 'heart blue love',
  '💜': 'heart purple love',
  '🖤': 'heart black dark love',
  '🤍': 'heart white love',
  '🤎': 'heart brown love',
  '💝': 'heart ribbon gift love',
  '💘': 'heart arrow cupid love',
  '💖': 'heart sparkle love',
  '💗': 'heart growing love',
  '💓': 'heart beating love',
  '💞': 'heart revolving love',
  '💕': 'heart two love',
  '❤️‍🔥': 'heart fire passion love',
  '❤️‍🩹': 'heart mending heal recover',
  '💟': 'heart decoration love',

  // Faces
  '😊': 'smile happy warm face',
  '😃': 'smile happy face grin open',
  '😄': 'smile grin face happy',
  '😁': 'grin face teeth happy',
  '😆': 'laugh face squint happy',
  '😅': 'sweat smile nervous happy',
  '🤣': 'rofl laugh rolling floor',
  '😂': 'laugh cry tears joy',
  '🙂': 'smile slight face',
  '😉': 'wink face flirt',
  '😇': 'angel face innocent halo',
  '🥰': 'love face hearts adore',
  '😍': 'heart eyes face love',
  '🤩': 'star eyes face excited amazing',
  '😘': 'kiss face love blow',
  '😋': 'yum face delicious tongue',
  '😎': 'cool sunglasses face awesome',
  '🤓': 'nerd glasses face geek smart',
  '🧐': 'monocle face curious inspect',
  '🤔': 'think face hmm wonder question',
  '🤗': 'hug face warm embrace',
  '🤫': 'shush face quiet secret',
  '🤭': 'giggle face cover mouth',
  '😏': 'smirk face sly',
  '😐': 'neutral face blank',
  '😑': 'expressionless face blank',
  '😶': 'mute face quiet silence',
  '😬': 'grimace face cringe awkward',
  '🙄': 'eye roll face annoyed whatever',
  '😮': 'open mouth face surprise',
  '😯': 'hushed face surprise quiet',
  '😲': 'astonished face shock surprise',
  '🥺': 'pleading face puppy eyes sad cute',
  '😢': 'cry face tear sad',
  '😭': 'sob face crying loud sad',
  '😤': 'huff face triumph angry',
  '😡': 'angry face mad rage red',
  '🤬': 'swear face cursing angry symbols',
  '😈': 'devil face smiling imp evil',
  '👿': 'devil face angry imp evil',
  '💀': 'skull dead death skeleton',
  '☠️': 'skull crossbones death danger poison',
  '💩': 'poop poo pile',
  '🤡': 'clown face circus joker',
  '👹': 'ogre face monster',
  '👺': 'goblin face monster',
  '👻': 'ghost face halloween spooky',
  '👽': 'alien face space ufo',
  '👾': 'alien monster space invader game',
  '🤖': 'robot face bot machine ai',
  '🎃': 'jack lantern pumpkin halloween',
  '😷': 'mask face sick medical',
  '🤒': 'sick face thermometer fever',
  '🤕': 'bandage face hurt injured',
  '🤢': 'nauseated face sick green',
  '🤮': 'vomit face sick throw up',
  '🥴': 'woozy face drunk tipsy',
  '😵': 'dizzy face spiral daze',
  '🤯': 'exploding head mind blown wow',
  '🥳': 'party face celebrate birthday horn',
  '🥸': 'disguise face glasses nose',
  '😴': 'sleep face zzz nap tired',
  '🥱': 'yawn face tired sleepy bored',

  // People
  '👍': 'thumbs up good yes approve like',
  '👎': 'thumbs down bad no disapprove dislike',
  '👋': 'wave hand hello goodbye hi',
  '✋': 'hand stop raised high five',
  '🤝': 'handshake deal agreement partner',
  '👏': 'clap hands applause bravo',
  '🙏': 'pray hands please thank fold',
  '✌️': 'peace victory sign fingers',
  '🤞': 'crossed fingers luck hope wish',
  '🤙': 'call hand hang loose shaka',
  '👆': 'point up finger',
  '👇': 'point down finger',
  '👈': 'point left finger',
  '👉': 'point right finger',
  '☝️': 'point up index finger',
  '🫶': 'heart hands love care',
  '✊': 'fist raised power',
  '👊': 'fist bump punch',
  '💪': 'muscle strong flex bicep',
  '🧑‍💻': 'technologist coder developer programmer engineer',
  '👤': 'person silhouette user profile',
  '👥': 'people group team users',
  '🧠': 'brain smart think mind intelligence',
  '👀': 'eyes look see watch',
  '👁️': 'eye look see watch',
  '👨‍🔬': 'scientist man research lab',
  '👩‍🎨': 'artist woman creative paint',
  '👨‍🏫': 'teacher man professor school',
  '👩‍🚀': 'astronaut woman space',
  '🧑‍🔧': 'mechanic engineer repair fix',
  '👩‍💼': 'office woman business professional',
  '🧑‍🍳': 'chef cook kitchen food',
  '👨‍⚕️': 'doctor man health medical',
  '💃': 'dancer woman dance salsa',
  '🕺': 'dancer man dance',

  // Nature
  '🌈': 'rainbow colors arc spectrum',
  '🌿': 'herb leaf plant green nature',
  '🌻': 'sunflower sun flower yellow',
  '🌍': 'globe earth world europe africa',
  '🌎': 'globe earth world americas',
  '🌏': 'globe earth world asia',
  '⚡': 'lightning bolt electric power zap energy',
  '☀️': 'sun bright day warm',
  '🌙': 'moon crescent night',
  '⛅': 'cloud sun partly cloudy weather',
  '🌊': 'wave ocean water sea',
  '❄️': 'snowflake ice cold winter frost',
  '🍀': 'clover four leaf luck lucky',
  '🌸': 'cherry blossom flower pink spring',
  '🌺': 'hibiscus flower tropical',
  '🌲': 'evergreen tree pine forest',
  '🍂': 'fallen leaf autumn fall',
  '🌵': 'cactus desert dry',
  '🌋': 'volcano eruption mountain lava',
  '🌄': 'sunrise mountain morning',
  '🌅': 'sunrise sunset evening',
  '🌌': 'milky way galaxy stars night sky space',
  '☁️': 'cloud weather overcast',
  '🌧️': 'rain cloud weather',
  '☔': 'umbrella rain weather',
  '💧': 'drop water droplet',
  '🌱': 'seedling plant grow sprout',
  '🌳': 'tree deciduous oak',
  '🌴': 'palm tree tropical beach',
  '🍁': 'maple leaf fall autumn canada',
  '🌷': 'tulip flower spring',
  '🌹': 'rose flower red love',
  '🪷': 'lotus flower zen meditation',
  '💐': 'bouquet flowers gift',

  // Animals
  '🐱': 'cat face pet kitten',
  '🐶': 'dog face pet puppy',
  '🦊': 'fox face animal clever',
  '🐻': 'bear face animal',
  '🐼': 'panda face bear',
  '🦁': 'lion face king animal',
  '🐯': 'tiger face animal stripes',
  '🐸': 'frog face animal',
  '🦋': 'butterfly insect beautiful',
  '🐝': 'bee honeybee insect honey',
  '🐢': 'turtle tortoise slow',
  '🦄': 'unicorn magic horse fantasy',
  '🐙': 'octopus tentacle sea',
  '🦅': 'eagle bird freedom',
  '🐧': 'penguin bird cold ice',
  '🐳': 'whale ocean sea big',
  '🦉': 'owl bird night wise',
  '🐺': 'wolf howl animal',
  '🦈': 'shark fish danger teeth',
  '🐬': 'dolphin ocean friendly',
  '🐍': 'snake serpent slither',
  '🦎': 'lizard reptile gecko',
  '🐞': 'ladybug bug insect luck',
  '🕷️': 'spider web insect',
  '🦀': 'crab crustacean beach',
  '🐾': 'paw prints animal pet feet',
  '🐰': 'rabbit bunny face',
  '🐹': 'hamster face pet',

  // Food
  '☕': 'coffee cup hot drink cafe',
  '🍕': 'pizza slice food italian',
  '🍎': 'apple red fruit healthy',
  '🍋': 'lemon citrus yellow sour',
  '🍓': 'strawberry berry fruit red',
  '🍩': 'donut doughnut sweet dessert',
  '🧁': 'cupcake cake sweet dessert muffin',
  '🍺': 'beer mug drink bar',
  '🍔': 'hamburger burger food fast',
  '🌮': 'taco food mexican',
  '🍣': 'sushi food japanese fish',
  '🍱': 'bento box food japanese meal',
  '🥗': 'salad food healthy green',
  '🍜': 'noodles ramen food bowl soup',
  '🎂': 'cake birthday celebration party',
  '🍰': 'cake slice shortcake dessert',
  '🍫': 'chocolate candy sweet',
  '🍿': 'popcorn movie snack corn',
  '🍷': 'wine glass drink red',
  '🥑': 'avocado fruit food green',
  '🍇': 'grapes fruit wine purple',
  '🍌': 'banana fruit yellow',
  '🍉': 'watermelon fruit summer',

  // Travel
  '🏠': 'house home building residence',
  '🏡': 'house garden home yard',
  '🏢': 'office building business work',
  '🏗️': 'construction building crane',
  '🗺️': 'map world travel atlas',
  '🧭': 'compass navigation direction',
  '✈️': 'airplane plane travel flight fly',
  '🚂': 'train locomotive rail',
  '🚗': 'car vehicle auto drive',
  '🚌': 'bus vehicle transit public',
  '🚁': 'helicopter fly aircraft',
  '🚲': 'bicycle bike ride cycle',
  '🚀': 'rocket space launch ship fast',
  '🗼': 'tower tokyo landmark',
  '🗽': 'statue liberty new york landmark',
  '🏰': 'castle palace fortress medieval',
  '🏛️': 'classical building museum government',
  '⛩️': 'shinto shrine torii japan',

  // Activities
  '🎮': 'game controller video play joystick',
  '🧩': 'puzzle piece jigsaw fit',
  '🎲': 'dice game chance roll',
  '♟️': 'chess piece pawn strategy game',
  '🏀': 'basketball sport ball',
  '⚽': 'soccer football sport ball',
  '🎾': 'tennis sport ball racket',
  '🏋️': 'weight lift gym exercise fitness',
  '🎯': 'target bullseye goal aim',
  '🎨': 'art palette paint creative color',
  '🎵': 'music note sound',
  '🎶': 'music notes sound melody',
  '📷': 'camera photo picture',
  '🎬': 'movie film clapperboard cinema',
  '🎭': 'theater drama performing arts masks',
  '🎤': 'microphone sing karaoke music voice',
  '🎧': 'headphones music audio listen',
  '🎹': 'piano keyboard music keys',
  '🎸': 'guitar music rock instrument',

  // Tech
  '💬': 'speech bubble chat talk message comment',
  '📧': 'email mail envelope message',
  '📱': 'phone mobile smartphone cell',
  '💻': 'laptop computer mac device',
  '🖥️': 'desktop computer monitor screen',
  '🌐': 'globe web internet world',
  '📡': 'satellite antenna signal broadcast',
  '🔗': 'link chain url connect',
  '📞': 'phone telephone call',
  '🔔': 'bell notification alert ring',
  '📣': 'megaphone announce loud speaker',
  '🗣️': 'speaking head voice talk',
  '💭': 'thought bubble think cloud',
  '🛜': 'wifi wireless internet network',
  '💾': 'floppy disk save storage',
  '📀': 'dvd disc optical media',
  '🖨️': 'printer print output paper',
  '⌨️': 'keyboard type input',
  '🖱️': 'mouse click computer',
  '🔋': 'battery power charge energy',

  // Objects & Tools
  '🔧': 'wrench tool fix repair',
  '🔨': 'hammer tool build nail',
  '🪛': 'screwdriver tool fix',
  '🪚': 'saw tool cut wood',
  '🔩': 'nut bolt screw hardware',
  '🧰': 'toolbox tools repair kit',
  '🪜': 'ladder climb step',
  '🧱': 'brick build block wall',
  '🔑': 'key lock access security',
  '🔒': 'lock secure closed padlock',
  '🔓': 'unlock open access padlock',
  '🗝️': 'key old vintage skeleton',
  '🧪': 'test tube science experiment lab',
  '🔬': 'microscope science lab research zoom',
  '🔭': 'telescope space astronomy look far',
  '💊': 'pill medicine drug health',
  '🩺': 'stethoscope doctor medical health',
  '🧬': 'dna genetics biology helix',
  '🦠': 'microbe germ virus bacteria',
  '⚗️': 'alembic chemistry distill',
  '🎁': 'gift present box wrapped surprise',
  '🎈': 'balloon party celebrate',
  '🎉': 'party popper tada celebrate confetti',
  '🎊': 'confetti ball celebrate',
  '🎀': 'ribbon bow gift decoration',
  '🕯️': 'candle flame light',
  '🔦': 'flashlight torch light beam',
  '🏮': 'lantern red paper japanese',
  '🛡️': 'shield protect defense guard',
  '⚖️': 'scales balance justice law',
  '🪄': 'wand magic spell wizard',
  '🔮': 'crystal ball fortune magic predict',
  '👑': 'crown king queen royal',
  '🎩': 'top hat magic gentleman',
  '💍': 'ring diamond wedding engagement',
  '👓': 'glasses spectacles read vision',
  '🕶️': 'sunglasses cool dark',

  // Time
  '⏰': 'alarm clock time wake',
  '📅': 'calendar date schedule',
  '🗓️': 'calendar spiral date schedule plan',
  '⏳': 'hourglass sand time flowing',
  '⌛': 'hourglass sand time done',
  '⏱️': 'stopwatch timer speed',
  '⏲️': 'timer clock countdown',

  // Money
  '💰': 'money bag cash rich gold',
  '💳': 'credit card payment bank',
  '🏦': 'bank money building finance',
  '🧮': 'abacus calculate count math',
  '💵': 'dollar bill money cash',
  '💸': 'money wings fly spend',
  '🪙': 'coin money metal',
  '💹': 'chart yen upward trend',
  '🧾': 'receipt bill invoice purchase',
  '💼': 'briefcase business work professional',

  // Flags
  '🏁': 'flag checkered finish race',
  '🚩': 'flag red triangular alert warning',
  '🏳️': 'flag white surrender peace',
  '🏴': 'flag black pirate',
  '🎌': 'flag crossed celebration',
  '🔴': 'circle red dot',
  '🟠': 'circle orange dot',
  '🟡': 'circle yellow dot',
  '🟢': 'circle green dot',
  '🔵': 'circle blue dot',
  '🟣': 'circle purple dot',
  '⚫': 'circle black dot',
  '⚪': 'circle white dot',

  // New docs
  '🖍️': 'crayon draw color',
  '🖌️': 'paintbrush brush paint art',
  '🗳️': 'ballot box vote election',
  '📥': 'inbox tray download receive',
  '📤': 'outbox tray upload send',
  '📫': 'mailbox mail post letter',

  // New symbols - zodiac
  '♈': 'aries zodiac sign',
  '♉': 'taurus zodiac sign',
  '♊': 'gemini zodiac sign',
  '♋': 'cancer zodiac sign',
  '♌': 'leo zodiac sign',
  '♍': 'virgo zodiac sign',
  '♎': 'libra zodiac sign',
  '♏': 'scorpio zodiac sign',
  '♐': 'sagittarius zodiac sign',
  '♑': 'capricorn zodiac sign',
  '♒': 'aquarius zodiac sign',
  '♓': 'pisces zodiac sign',
  '🔰': 'beginner new japanese',
  '⚕️': 'medical health caduceus',

  // New faces
  '😀': 'grin smile happy face',
  '🙃': 'upside down face ironic sarcastic',
  '😗': 'kiss face pucker',
  '☺️': 'smile relaxed happy blush',
  '😚': 'kiss closed eyes face love',
  '😙': 'kiss smile face',
  '🥲': 'smile tear happy sad',
  '😛': 'tongue out face playful',
  '😜': 'wink tongue face crazy',
  '🤪': 'zany face wild crazy goofy',
  '😝': 'squint tongue face playful',
  '🤑': 'money mouth face rich dollar',
  '🫢': 'face open eyes hand over mouth',
  '🫣': 'peeking face shy curious',
  '🫡': 'salute face respect honor',
  '🤐': 'zipper mouth face quiet secret',
  '🤨': 'raised eyebrow face skeptic suspicious',
  '🫥': 'dotted face invisible hidden',
  '😒': 'unamused face annoyed unhappy',
  '🤥': 'lying face pinocchio nose',
  '🫠': 'melting face dissolve warm embarrassed',
  '😔': 'pensive face sad thoughtful',
  '😪': 'sleepy face tired tear',
  '🤤': 'drool face hungry yum',
  '😵‍💫': 'dizzy spiral face confused',
  '🫤': 'diagonal mouth face unsure skeptical',
  '😟': 'worried face concern anxious',
  '😮‍💨': 'exhale sigh face relief frustration',
  '😳': 'flushed face embarrassed surprise',
  '🥹': 'hold back tears face emotional touched',
  '😦': 'frown open mouth face shock',
  '😧': 'anguished face distress',
  '😨': 'fearful face scared afraid',
  '😰': 'anxious sweat face nervous',
  '😥': 'sad relieved face disappointed',
  '😖': 'confounded face frustrated',
  '😣': 'persevere face struggle',
  '😞': 'disappointed face sad let down',
  '😓': 'downcast sweat face sad',
  '😩': 'weary face tired exhausted',
  '😫': 'tired face exhausted fed up',
  '😠': 'angry face mad',

  // New people
  '🤌': 'pinched fingers italian gesture',
  '🤏': 'pinch small little tiny',
  '🖐️': 'hand splayed open spread fingers',
  '👷': 'construction worker builder hard hat',
  '💂': 'guard royal soldier',
  '🕵️': 'detective spy investigate sleuth',
  '🧑‍✈️': 'pilot captain aviator',
  '🧑‍🦯': 'person cane blind',
  '🧙': 'mage wizard magic fantasy',
  '🧚': 'fairy magic fantasy wings',
  '🧛': 'vampire dracula fantasy',
  '🧜': 'merperson mermaid sea',
  '🧝': 'elf fantasy tolkien',
  '🧞': 'genie lamp wish magic',
  '🧟': 'zombie undead walking dead',
  '🦸': 'superhero hero power cape',
  '🦹': 'supervillain villain evil',
  '👫': 'couple man woman holding hands',
  '👬': 'men holding hands couple',
  '👭': 'women holding hands couple',
  '🧑‍🤝‍🧑': 'people holding hands together',
  '👪': 'family parents children',
  '🫂': 'hug embrace people',

  // New nature
  '🌑': 'new moon dark night',
  '🌒': 'waxing crescent moon',
  '🌓': 'first quarter moon half',
  '🌔': 'waxing gibbous moon',
  '🌕': 'full moon bright night',
  '🌖': 'waning gibbous moon',
  '🌗': 'last quarter moon half',
  '🌘': 'waning crescent moon',
  '🪐': 'planet saturn ring space',
  '🌆': 'cityscape dusk sunset buildings',
  '🌇': 'sunset city evening',
  '🏞️': 'national park landscape nature valley',

  // New animals
  '🐄': 'cow farm animal milk',
  '🐑': 'sheep lamb wool farm',
  '🐐': 'goat farm animal',
  '🐫': 'camel two hump desert',
  '🐪': 'camel one hump dromedary desert',
  '🦙': 'llama alpaca south america',
  '🦘': 'kangaroo joey australia',
  '🐇': 'rabbit bunny hop',
  '🦨': 'skunk stink spray',
  '🦡': 'badger animal dig',
  '🦃': 'turkey bird thanksgiving',
  '🐓': 'rooster cock chicken morning',
  '🦜': 'parrot bird colorful talk',
  '🦚': 'peacock bird colorful feather',
  '🦢': 'swan bird elegant white',
  '🪿': 'goose bird honk',
  '🐦': 'bird tweet chirp',
  '🐈': 'cat walk pet',
  '🐕': 'dog walk pet',
  '🦮': 'guide dog service blind',
  '🐩': 'poodle dog fancy',
  '🐁': 'mouse small rodent',
  '🐀': 'rat rodent',
  '🦝': 'raccoon trash panda',
  '🦧': 'orangutan ape primate',
  '🦍': 'gorilla ape primate',
  '🐂': 'ox bull strong',
  '🐃': 'water buffalo bovine',
  '🐏': 'ram sheep horns',
  '🦌': 'deer stag antlers',
  '🐖': 'pig farm pork',
  '🦬': 'bison buffalo prairie',

  // New food
  '🥥': 'coconut tropical palm',
  '🫒': 'olive oil green mediterranean',
  '🫑': 'bell pepper green vegetable',
  '🥬': 'leafy green lettuce kale vegetable',
  '🥒': 'cucumber vegetable green pickle',
  '🧄': 'garlic clove spice cooking',
  '🥜': 'peanut nut snack',
  '🌰': 'chestnut nut acorn autumn',
  '🥞': 'pancake breakfast stack syrup',
  '🧈': 'butter dairy spread',
  '🥙': 'pita stuffed falafel',
  '🧆': 'falafel middle eastern food',
  '🥘': 'shallow pan cooking stew curry',
  '🫔': 'tamale mexican food corn',
  '🥧': 'pie dessert baked apple',
  '🍮': 'custard pudding flan dessert',
  '🍭': 'lollipop candy sweet stick',
  '🍬': 'candy sweet wrapper',
  '🍡': 'dango japanese sweet skewer',
  '🍘': 'rice cracker japanese snack',
  '🍙': 'rice ball onigiri japanese',
  '🍚': 'rice bowl cooked white',
  '🍛': 'curry rice dish',
  '🍢': 'oden skewer japanese food',
  '🍤': 'shrimp fried tempura prawn',
  '🍥': 'fish cake narutomaki swirl',
  '🥮': 'moon cake chinese pastry',
  '🥟': 'dumpling gyoza dim sum',
  '🥠': 'fortune cookie chinese',
  '🥡': 'takeout box chinese food container',
  '🫘': 'beans legume seed',
  '🧊': 'ice cube cold frozen',

  // New travel
  '🚑': 'ambulance emergency medical hospital',
  '🚒': 'fire engine truck emergency',
  '🚓': 'police car law enforcement',
  '🚔': 'police car oncoming',
  '🚖': 'taxi oncoming cab',
  '🚘': 'automobile oncoming car',
  '🚙': 'suv sport utility vehicle',
  '🛻': 'pickup truck',
  '🚐': 'minibus van',
  '🚎': 'trolleybus electric bus',
  '🛺': 'auto rickshaw tuk tuk',
  '🚜': 'tractor farm vehicle',
  '🛵': 'motor scooter vespa',
  '🏎️': 'racing car formula',
  '🚄': 'high speed train bullet',
  '🚝': 'monorail train',

  // New activities
  '🥏': 'flying disc frisbee ultimate',
  '🪀': 'yo-yo toy string',
  '🛼': 'roller skate',
  '🤼': 'wrestling sport grapple',
  '🤽': 'water polo sport',
  '🤾': 'handball sport',
  '🧘': 'yoga meditation zen lotus',
  '🧖': 'sauna steam spa relax',
  '🛀': 'bath tub relax soak',
  '🎿': 'ski snow winter slope',
  '🏂': 'snowboard winter sport',
  '🪂': 'parachute skydive fall',
  '🛹': 'skateboard skate board ride trick',
  '🎽': 'running shirt sport athletic',

  // New tech
  '🖲️': 'trackball input device',
  '🎚️': 'level slider volume control',
  '🎛️': 'control knobs dial settings',

  // New objects - household & clothing
  '🪥': 'toothbrush dental hygiene',
  '🧴': 'lotion bottle cream moisturizer',
  '🧹': 'broom sweep clean',
  '🧺': 'basket laundry wicker',
  '🧻': 'toilet paper roll tissue',
  '🪣': 'bucket pail container',
  '🧼': 'soap clean wash bar',
  '🫧': 'bubbles soap foam',
  '🪒': 'razor shave blade',
  '🧽': 'sponge clean absorb',
  '👔': 'necktie tie business formal',
  '👕': 'tshirt shirt clothing top',
  '👖': 'jeans pants denim clothing',
  '👗': 'dress clothing woman',
  '🧥': 'coat jacket outerwear',
  '🧦': 'socks feet clothing',
  '🧤': 'gloves hands warm winter',
  '🧣': 'scarf neck warm winter',
  '👘': 'kimono japanese traditional robe',
  '🥻': 'sari indian traditional dress',
  '🩱': 'one piece swimsuit bathing',
  '🩲': 'briefs underwear shorts',
  '🩳': 'shorts clothing casual',
  '👙': 'bikini swimsuit beach',
  '🩴': 'flip flop sandal thong',

  // New time
  '🕜': 'clock 1:30 time',
  '🕝': 'clock 2:30 time',
  '🕞': 'clock 3:30 time',
  '🕟': 'clock 4:30 time',
  '🕠': 'clock 5:30 time',
  '🕡': 'clock 6:30 time',
  '🕢': 'clock 7:30 time',
  '🕣': 'clock 8:30 time',
  '🕤': 'clock 9:30 time',

  // New flags
  '🏴‍☠️': 'pirate flag skull crossbones',
  '🏳️‍🌈': 'rainbow flag pride lgbtq',
  '🏳️‍⚧️': 'transgender flag pride',
  '🟥': 'red square',
  '🟧': 'orange square',
  '🟨': 'yellow square',
  '🟩': 'green square',
  '🟦': 'blue square',
  '🟪': 'purple square',
  '⬛': 'black square',
  '⬜': 'white square',
  '🟫': 'brown square',
  '💠': 'diamond blue dot shape',
  '☢️': 'radioactive nuclear hazard',
  '☣️': 'biohazard biological danger',
  '⚛️': 'atom science physics nuclear',
  '㊙️': 'secret japanese kanji',

  // Colors & shapes
  '🔺': 'triangle red up',
  '🔻': 'triangle red down',
  '◾': 'medium small black square',
  '◽': 'medium small white square',

  // Country flags
  '🇺🇸': 'flag us usa united states america',
  '🇨🇦': 'flag canada',
  '🇲🇽': 'flag mexico',
  '🇧🇷': 'flag brazil',
  '🇦🇷': 'flag argentina',
  '🇨🇴': 'flag colombia',
  '🇨🇱': 'flag chile',
  '🇵🇪': 'flag peru',
  '🇻🇪': 'flag venezuela',
  '🇪🇨': 'flag ecuador',
  '🇨🇺': 'flag cuba',
  '🇵🇷': 'flag puerto rico',
  '🇯🇲': 'flag jamaica',
  '🇭🇹': 'flag haiti',
  '🇩🇴': 'flag dominican republic',
  '🇨🇷': 'flag costa rica',
  '🇵🇦': 'flag panama',
  '🇺🇾': 'flag uruguay',
  '🇵🇾': 'flag paraguay',
  '🇧🇴': 'flag bolivia',
  '🇬🇹': 'flag guatemala',
  '🇭🇳': 'flag honduras',
  '🇸🇻': 'flag el salvador',
  '🇳🇮': 'flag nicaragua',
  '🇬🇧': 'flag uk united kingdom britain england',
  '🇫🇷': 'flag france french',
  '🇩🇪': 'flag germany german',
  '🇪🇸': 'flag spain spanish',
  '🇮🇹': 'flag italy italian',
  '🇵🇹': 'flag portugal portuguese',
  '🇳🇱': 'flag netherlands dutch holland',
  '🇧🇪': 'flag belgium',
  '🇨🇭': 'flag switzerland swiss',
  '🇦🇹': 'flag austria',
  '🇸🇪': 'flag sweden swedish',
  '🇳🇴': 'flag norway norwegian',
  '🇩🇰': 'flag denmark danish',
  '🇫🇮': 'flag finland finnish',
  '🇮🇸': 'flag iceland',
  '🇮🇪': 'flag ireland irish',
  '🇵🇱': 'flag poland polish',
  '🇨🇿': 'flag czech republic czechia',
  '🇷🇴': 'flag romania',
  '🇭🇺': 'flag hungary',
  '🇬🇷': 'flag greece greek',
  '🇭🇷': 'flag croatia',
  '🇷🇸': 'flag serbia',
  '🇧🇬': 'flag bulgaria',
  '🇸🇰': 'flag slovakia',
  '🇸🇮': 'flag slovenia',
  '🇱🇹': 'flag lithuania',
  '🇱🇻': 'flag latvia',
  '🇪🇪': 'flag estonia',
  '🇺🇦': 'flag ukraine',
  '🇲🇩': 'flag moldova',
  '🇧🇾': 'flag belarus',
  '🇦🇱': 'flag albania',
  '🇲🇰': 'flag north macedonia',
  '🇲🇪': 'flag montenegro',
  '🇽🇰': 'flag kosovo',
  '🇧🇦': 'flag bosnia herzegovina',
  '🇱🇺': 'flag luxembourg',
  '🇲🇹': 'flag malta',
  '🇨🇾': 'flag cyprus',
  '🇯🇵': 'flag japan japanese',
  '🇰🇷': 'flag south korea korean',
  '🇨🇳': 'flag china chinese',
  '🇹🇼': 'flag taiwan',
  '🇭🇰': 'flag hong kong',
  '🇲🇴': 'flag macao macau',
  '🇮🇳': 'flag india indian',
  '🇵🇰': 'flag pakistan',
  '🇧🇩': 'flag bangladesh',
  '🇱🇰': 'flag sri lanka',
  '🇳🇵': 'flag nepal',
  '🇹🇭': 'flag thailand thai',
  '🇻🇳': 'flag vietnam vietnamese',
  '🇮🇩': 'flag indonesia',
  '🇲🇾': 'flag malaysia',
  '🇸🇬': 'flag singapore',
  '🇵🇭': 'flag philippines filipino',
  '🇲🇲': 'flag myanmar burma',
  '🇰🇭': 'flag cambodia',
  '🇱🇦': 'flag laos',
  '🇲🇳': 'flag mongolia',
  '🇰🇿': 'flag kazakhstan',
  '🇺🇿': 'flag uzbekistan',
  '🇦🇿': 'flag azerbaijan',
  '🇬🇪': 'flag georgia',
  '🇦🇲': 'flag armenia',
  '🇮🇱': 'flag israel',
  '🇵🇸': 'flag palestine',
  '🇱🇧': 'flag lebanon',
  '🇯🇴': 'flag jordan',
  '🇸🇦': 'flag saudi arabia',
  '🇦🇪': 'flag uae united arab emirates dubai',
  '🇶🇦': 'flag qatar',
  '🇰🇼': 'flag kuwait',
  '🇧🇭': 'flag bahrain',
  '🇴🇲': 'flag oman',
  '🇮🇶': 'flag iraq',
  '🇮🇷': 'flag iran',
  '🇹🇷': 'flag turkey turkish',
  '🇾🇪': 'flag yemen',
  '🇦🇫': 'flag afghanistan',
  '🇸🇾': 'flag syria',
  '🇰🇬': 'flag kyrgyzstan',
  '🇹🇯': 'flag tajikistan',
  '🇹🇲': 'flag turkmenistan',
  '🇧🇳': 'flag brunei',
  '🇹🇱': 'flag timor leste east',
  '🇫🇯': 'flag fiji',
  '🇦🇺': 'flag australia australian',
  '🇳🇿': 'flag new zealand',
  '🇵🇬': 'flag papua new guinea',
  '🇼🇸': 'flag samoa',
  '🇹🇴': 'flag tonga',
  '🇻🇺': 'flag vanuatu',
  '🇸🇧': 'flag solomon islands',
  '🇰🇮': 'flag kiribati',
  '🇿🇦': 'flag south africa',
  '🇳🇬': 'flag nigeria',
  '🇪🇬': 'flag egypt',
  '🇰🇪': 'flag kenya',
  '🇪🇹': 'flag ethiopia',
  '🇬🇭': 'flag ghana',
  '🇹🇿': 'flag tanzania',
  '🇺🇬': 'flag uganda',
  '🇩🇿': 'flag algeria',
  '🇲🇦': 'flag morocco',
  '🇹🇳': 'flag tunisia',
  '🇱🇾': 'flag libya',
  '🇸🇩': 'flag sudan',
  '🇸🇸': 'flag south sudan',
  '🇸🇳': 'flag senegal',
  '🇨🇲': 'flag cameroon',
  '🇨🇮': 'flag ivory coast cote divoire',
  '🇲🇱': 'flag mali',
  '🇧🇫': 'flag burkina faso',
  '🇳🇪': 'flag niger',
  '🇹🇩': 'flag chad',
  '🇨🇬': 'flag congo republic',
  '🇨🇩': 'flag congo democratic',
  '🇦🇴': 'flag angola',
  '🇲🇿': 'flag mozambique',
  '🇿🇼': 'flag zimbabwe',
  '🇧🇼': 'flag botswana',
  '🇳🇦': 'flag namibia',
  '🇿🇲': 'flag zambia',
  '🇲🇼': 'flag malawi',
  '🇲🇬': 'flag madagascar',
  '🇲🇺': 'flag mauritius',
  '🇷🇼': 'flag rwanda',
  '🇧🇮': 'flag burundi',
  '🇩🇯': 'flag djibouti',
  '🇪🇷': 'flag eritrea',
  '🇸🇴': 'flag somalia',
  '🇬🇦': 'flag gabon',
  '🇬🇶': 'flag equatorial guinea',
  '🇱🇸': 'flag lesotho',

  // Body parts
  '✍️': 'writing hand pen',
  '👂': 'ear listen hear sound',
  '👃': 'nose smell sniff',
  '🦷': 'tooth dental teeth',
  '🦴': 'bone skeleton',
  '🫀': 'anatomical heart organ',
  '🫁': 'lungs breathe organ',
  '🦶': 'foot kick step',
  '🦵': 'leg knee limb',
  '👅': 'tongue taste lick',
  '👄': 'mouth lips kiss',
  '🫦': 'biting lip nervous anxious',
  '🦻': 'ear hearing aid deaf',

  // Signs & labels
  '🅰️': 'a button blood type letter',
  '🅱️': 'b button blood type letter',
  '🆎': 'ab button blood type',
  '🆑': 'cl button clear',
  '🅾️': 'o button blood type letter',
  '🆘': 'sos help emergency rescue',
  '🆔': 'id identification badge',
  '🆕': 'new fresh badge',
  '🆗': 'ok button approve accept',
  '🆙': 'up button upgrade update',
  '🆒': 'cool button awesome',
  '🆓': 'free button gratis',
  '🚸': 'children crossing sign school',
  '🔞': 'no minors underage prohibited adult',
  '🚭': 'no smoking prohibited sign',
  '🚯': 'no littering prohibited sign',
  '🚱': 'non potable water sign',
  '🚳': 'no bicycles prohibited sign',
  '🛑': 'stop sign octagon halt',
  '🔙': 'back arrow return previous',
  '🔚': 'end arrow finish',
  '🔛': 'on arrow active',
  '🔜': 'soon arrow coming',
  '🔝': 'top arrow up',
  '↗️': 'arrow up right northeast',
  '↘️': 'arrow down right southeast',
  '↙️': 'arrow down left southwest',
  '↖️': 'arrow up left northwest',
  '↕️': 'arrow up down vertical',
  '↔️': 'arrow left right horizontal',

  // Symbols extras
  '⏭️': 'skip forward next track',
  '⏮️': 'skip backward previous track',
  '🔎': 'magnifying glass right search zoom',
  '📢': 'loudspeaker announce broadcast public',
  '🔢': 'numbers input 1234',
  '🔣': 'symbols input signs',
  '🔤': 'abc letters alphabet latin',
  '🔡': 'lowercase letters abc small',
  '🔠': 'uppercase letters ABC capital',
  '#️⃣': 'hash number pound keycap',
  '*️⃣': 'asterisk star keycap',
  '0️⃣': 'zero keycap number',
  '1️⃣': 'one keycap number',
  '2️⃣': 'two keycap number',
  '3️⃣': 'three keycap number',
  '4️⃣': 'four keycap number',
  '5️⃣': 'five keycap number',
  '6️⃣': 'six keycap number',
  '7️⃣': 'seven keycap number',
  '8️⃣': 'eight keycap number',
  '9️⃣': 'nine keycap number',
  '🔟': 'ten keycap number',

  // Objects extras
  '🪖': 'military helmet army soldier',
  '⛑️': 'rescue helmet worker safety',
  '🎓': 'graduation cap hat education school',
  '💄': 'lipstick makeup cosmetics',
  '🪮': 'hair pick comb afro',
  '🛍️': 'shopping bags retail store',
  '🧵': 'thread sewing string stitch',
  '🧶': 'yarn knit crochet wool',
  '🪡': 'needle sewing pin stitch',
  '🚿': 'shower water bath clean',
  '🪠': 'plunger plumbing toilet',
  '🧯': 'fire extinguisher safety',
  '🪵': 'wood log lumber timber',
  '🛒': 'shopping cart trolley store',
  '🚪': 'door entrance exit room',
  '🛞': 'wheel tire car circle',
  '🛟': 'ring buoy life preserver safety',
  '⚓': 'anchor ship boat maritime',
  '🚢': 'ship boat cruise ocean',
  '🛳️': 'passenger ship cruise liner',
  '🚟': 'suspension railway monorail',
  '🚠': 'mountain cableway gondola ski',
  '🚡': 'aerial tramway cable car',

  // --- Fill missing keywords ---

  // Documents
  '📮': 'postbox mailbox send letter',

  // Symbols
  '🔘': 'radio button circle select',
  '🔲': 'black square button',
  '🔳': 'white square button',
  '◼️': 'black medium square',
  '◻️': 'white medium square',
  '▪️': 'black small square',
  '▫️': 'white small square',
  '🔹': 'small blue diamond shape',

  // Signs
  '🈁': 'japanese here katakana',
  '🈂️': 'japanese service charge katakana',
  '🈷️': 'japanese monthly katakana',
  '🈶': 'japanese not free charge',
  '🈯': 'japanese reserved',

  // Hearts
  '💋': 'kiss mark lips love',

  // Faces
  '😌': 'relieved face calm peaceful content',
  '😕': 'confused face puzzled unsure',
  '🙁': 'slightly frowning face sad',
  '☹️': 'frowning face sad unhappy',
  '😱': 'screaming face fear horror shock',
  '😶‍🌫️': 'face clouds hidden fog shy',

  // People
  '🤟': 'love you gesture hand sign',
  '🤘': 'rock on horns metal hand',
  '🫰': 'hand index thumb crossed money snap',
  '🫵': 'index pointing you finger',
  '🫱': 'rightward hand push palm',
  '🫲': 'leftward hand push palm',
  '🫳': 'palm down hand lower drop',
  '🫴': 'palm up hand offer receive',
  '🤛': 'left fist bump punch',
  '🤜': 'right fist bump punch',
  '🤚': 'raised back hand stop',
  '👐': 'open hands jazz hug',
  '🙌': 'raising hands celebrate hooray',
  '👶': 'baby infant child newborn',
  '🧒': 'child kid young',
  '👩‍🌾': 'farmer woman agriculture',
  '👨‍🎤': 'singer man artist musician',
  '👩‍💻': 'technologist woman coder developer',
  '🧑‍🎓': 'student graduate school university',
  '👨‍🍳': 'chef man cook kitchen',
  '👩‍🔬': 'scientist woman research lab',
  '🧑‍🚒': 'firefighter rescue emergency',
  '👮': 'police officer cop law',
  '🧑‍🦼': 'person motorized wheelchair',
  '🧑‍🦽': 'person manual wheelchair',
  '🧎': 'kneeling person kneel',
  '🧍': 'standing person stand',
  '🚶': 'walking person walk pedestrian',
  '🏃': 'running person run jog sprint',
  '🤸': 'cartwheel person gymnastics',

  // Nature
  '🌛': 'first quarter moon face',
  '🌜': 'last quarter moon face',
  '🌝': 'full moon face smile',
  '🌞': 'sun face bright',
  '⛈️': 'thunderstorm cloud rain lightning',
  '🌪️': 'tornado twister cyclone storm',
  '🌫️': 'fog mist haze cloudy',
  '🌤️': 'sun small cloud partly',
  '🌥️': 'sun large cloud mostly cloudy',
  '🌦️': 'sun cloud rain shower',
  '☃️': 'snowman snow winter cold',
  '⛄': 'snowman without snow winter',
  '💦': 'sweat droplets splash water',
  '🔆': 'bright high brightness sun',
  '🌡️': 'thermometer temperature hot cold',
  '☘️': 'shamrock clover irish green',
  '🍃': 'leaf fluttering wind blow',
  '🌼': 'blossom flower yellow daisy',
  '🪻': 'hyacinth flower purple',
  '🌾': 'sheaf rice grain wheat crop',
  '🪴': 'potted plant houseplant indoor',
  '🍄': 'mushroom fungus toadstool',
  '🪨': 'rock stone boulder',
  '🏔️': 'snow capped mountain peak',
  '🌠': 'shooting star wish meteor',
  '🌉': 'bridge night city',
  '⛰️': 'mountain peak hill',
  '🏜️': 'desert dry sand dunes',
  '🌃': 'night stars city buildings',
  '🌁': 'foggy bridge san francisco',

  // Animals
  '🐮': 'cow face farm moo',
  '🐷': 'pig face farm oink',
  '🐵': 'monkey face primate',
  '🙈': 'see no evil monkey eyes',
  '🙉': 'hear no evil monkey ears',
  '🙊': 'speak no evil monkey mouth',
  '🐒': 'monkey primate climb',
  '🐠': 'tropical fish colorful',
  '🐡': 'blowfish puffer fish',
  '🦑': 'squid tentacle ocean',
  '🦐': 'shrimp prawn crustacean',
  '🐔': 'chicken hen poultry farm',
  '🦆': 'duck bird swim quack',
  '🦩': 'flamingo pink bird tropical',
  '🐭': 'mouse face small cute',
  '🐿️': 'chipmunk squirrel nut',
  '🦔': 'hedgehog prickly spiny',
  '🦇': 'bat vampire night flying',
  '🐴': 'horse face equine',
  '🦓': 'zebra stripes horse',
  '🦒': 'giraffe tall spots neck',
  '🐘': 'elephant trunk big grey',
  '🦏': 'rhinoceros rhino horn',
  '🦛': 'hippopotamus hippo river',
  '🐊': 'crocodile alligator reptile',
  '🐋': 'whale humpback ocean',
  '🐟': 'fish generic swimming',
  '🦭': 'seal sea lion ocean',
  '🐛': 'bug caterpillar insect worm',
  '🦗': 'cricket insect chirp',
  '🐜': 'ant insect colony',
  '🐌': 'snail slow shell slug',
  '🦥': 'sloth lazy slow hang',
  '🦦': 'otter swim play cute',
  '🦫': 'beaver dam build teeth',
  '🐕‍🦺': 'service dog vest assistance',

  // Food
  '🌯': 'burrito wrap tortilla mexican',
  '🍝': 'spaghetti pasta noodle italian',
  '🧇': 'waffle breakfast grid syrup',
  '🥐': 'croissant pastry french bread',
  '🥖': 'baguette bread french long',
  '🍞': 'bread loaf slice toast',
  '🥨': 'pretzel bread twisted salty',
  '🥯': 'bagel bread round dough',
  '🧀': 'cheese wedge dairy yellow',
  '🥚': 'egg chicken breakfast shell',
  '🍪': 'cookie biscuit sweet chocolate chip',
  '🥤': 'cup straw drink soda juice',
  '🧃': 'juice box drink beverage',
  '🥕': 'carrot vegetable orange root',
  '🌽': 'corn ear cob maize',
  '🫐': 'blueberry berry fruit blue',
  '🥭': 'mango fruit tropical yellow',
  '🍑': 'peach fruit fuzzy butt',
  '🍒': 'cherry fruit red pair',
  '🍐': 'pear fruit green',
  '🥝': 'kiwi fruit green fuzzy',
  '🍅': 'tomato vegetable red sauce',
  '🥦': 'broccoli vegetable green tree',
  '🧅': 'onion vegetable bulb layers',
  '🌶️': 'hot pepper chili spicy red',
  '🥩': 'meat cut steak beef',
  '🍗': 'poultry leg chicken drumstick',
  '🍖': 'meat bone rib',
  '🥓': 'bacon strip pork breakfast',
  '🌭': 'hot dog frankfurter sausage',
  '🍟': 'french fries chips potato fast',
  '🥪': 'sandwich bread lunch deli',
  '🫕': 'fondue cheese pot melted',
  '🍦': 'ice cream soft serve cone',
  '🧋': 'bubble tea boba milk drink',
  '🍵': 'tea cup hot green matcha',
  '🥂': 'clinking glasses cheers toast champagne',
  '🍻': 'clinking beer mugs cheers pint',
  '🥃': 'tumbler glass whiskey bourbon',
  '🍾': 'bottle popping cork champagne celebrate',
  '🫗': 'pouring liquid water drink',

  // Travel
  '🛥️': 'motor boat speedboat',
  '🏍️': 'motorcycle racing bike',
  '🚕': 'taxi cab yellow car',
  '🚃': 'railway car train carriage',
  '⛵': 'sailboat sailing wind yacht',
  '🚤': 'speedboat fast boat motor',
  '🛶': 'canoe kayak paddle boat',
  '🛸': 'flying saucer ufo alien spaceship',
  '🛩️': 'small airplane plane private',
  '🚅': 'bullet train high speed shinkansen',
  '🚆': 'train locomotive rail',
  '🚇': 'metro subway underground train',
  '🚊': 'tram trolley streetcar',
  '🚉': 'station train platform',
  '🚏': 'bus stop transit station',
  '🛣️': 'motorway highway road freeway',
  '🛤️': 'railway track train rail',
  '⛽': 'fuel pump gas station petrol',
  '🕌': 'mosque islam muslim prayer',
  '🕍': 'synagogue jewish temple',
  '⛪': 'church christian worship cathedral',
  '🏟️': 'stadium arena sports venue',
  '🏪': 'convenience store shop',
  '🏥': 'hospital medical health building',
  '🏫': 'school building education',
  '🏨': 'hotel building lodging stay',
  '🏭': 'factory industrial manufacturing',
  '🏬': 'department store shopping mall',
  '🗿': 'moai stone statue easter island',
  '🎡': 'ferris wheel carnival amusement',
  '🎢': 'roller coaster amusement ride',
  '🎠': 'carousel horse merry go round',
  '⛲': 'fountain water park',
  '🏕️': 'camping tent outdoor',
  '⛺': 'tent camping outdoor shelter',
  '🏖️': 'beach umbrella sand sun',
  '🏝️': 'desert island tropical palm',
  '🛖': 'hut shelter primitive',
  '🛕': 'hindu temple mandir',
  '🗻': 'mount fuji japan mountain',

  // Activities
  '🏈': 'american football sport ball',
  '⚾': 'baseball sport ball',
  '🏓': 'ping pong table tennis paddle',
  '🎳': 'bowling ball pins sport',
  '🏊': 'swimming person pool water',
  '🚴': 'bicycling person cycling bike',
  '🧗': 'climbing person rock wall',
  '🏄': 'surfing person wave board',
  '🎣': 'fishing rod pole catch',
  '🏇': 'horse racing jockey',
  '⛷️': 'skiing person snow slope',
  '🤺': 'fencing person sword sport',
  '🏸': 'badminton racket shuttlecock',
  '🥊': 'boxing glove punch fight',
  '🥋': 'martial arts uniform karate judo',
  '⛳': 'golf flag hole course',
  '🏌️': 'golfing person swing club',
  '🤿': 'diving mask snorkel scuba',
  '🛷': 'sled toboggan snow slide',
  '⛸️': 'ice skate skating figure',
  '🥅': 'goal net score',
  '🏒': 'ice hockey stick puck',
  '🥌': 'curling stone sport ice',
  '🪁': 'kite flying wind sky',
  '🎱': 'pool billiards eight ball',
  '🎰': 'slot machine gambling casino jackpot',
  '🎗️': 'reminder ribbon awareness cause',
  '🎫': 'ticket admission entry pass',
  '🎟️': 'admission ticket entry event',
  '🎺': 'trumpet horn brass instrument',
  '🥁': 'drum snare percussion beat',
  '🎻': 'violin fiddle string instrument',
  '🪕': 'banjo string instrument country',
  '🎷': 'saxophone sax jazz instrument',
  '🪗': 'accordion concertina squeeze',
  '📸': 'camera flash photo picture',
  '🎞️': 'film frames movie reel',
  '📹': 'video camera record camcorder',

  // Tech
  '💿': 'cd compact disc optical media',
  '🪫': 'low battery empty power dying',
  '🔌': 'electric plug power outlet socket',
  '📟': 'pager beeper device',
  '📠': 'fax machine office send',
  '📲': 'mobile phone arrow receive call',
  '☎️': 'telephone phone landline call',
  '📳': 'vibration mode phone silent',
  '📴': 'phone off mobile disabled',

  // Objects
  '⛏️': 'pick axe mine dig',
  '🧲': 'magnet attract metal force',
  '⚔️': 'crossed swords fight battle duel',
  '🗡️': 'dagger knife sword blade',
  '🔫': 'water gun pistol squirt toy',
  '🪃': 'boomerang return throw',
  '🪓': 'axe chop wood lumber',
  '🔐': 'locked key secure private',
  '💉': 'syringe needle injection vaccine shot',
  '🩸': 'blood drop red donate',
  '🩻': 'xray skeleton bone scan',
  '🩹': 'bandage adhesive plaster',
  '🩼': 'crutch injury support',
  '🪬': 'hamsa amulet protection evil eye',
  '🧿': 'nazar amulet evil eye protection',
  '🧧': 'red envelope gift money chinese',
  '🎏': 'carp streamer koinobori japanese',
  '🎐': 'wind chime bell japanese',
  '🪅': 'pinata party candy celebrate',
  '🪆': 'nesting dolls matryoshka russian',
  '🪞': 'mirror reflection glass',
  '🪟': 'window glass pane frame',
  '🛋️': 'couch sofa lounge furniture',
  '🪑': 'chair seat sit furniture',
  '🛏️': 'bed sleep bedroom furniture',
  '🧳': 'luggage suitcase travel bag',
  '🧢': 'baseball cap hat billed',
  '👟': 'running shoe sneaker athletic',
  '👠': 'high heel shoe stiletto woman',
  '👢': 'boot shoe tall woman',
  '🎒': 'backpack school bag rucksack',
  '👜': 'handbag purse bag fashion',
  '📿': 'prayer beads rosary necklace',

  // Time
  '🕐': 'clock one oclock 1 time',
  '🕑': 'clock two oclock 2 time',
  '🕒': 'clock three oclock 3 time',
  '🕓': 'clock four oclock 4 time',
  '🕔': 'clock five oclock 5 time',
  '🕕': 'clock six oclock 6 time',
  '🕖': 'clock seven oclock 7 time',
  '🕗': 'clock eight oclock 8 time',
  '🕘': 'clock nine oclock 9 time',
  '🕙': 'clock ten oclock 10 time',
  '🕚': 'clock eleven oclock 11 time',
  '🕛': 'clock twelve oclock 12 time',
  '🕰️': 'mantelpiece clock ornate',
  '📆': 'tear off calendar date day',
  '🔕': 'bell slash mute silent notification off',

  // Money
  '💴': 'yen banknote money japanese',
  '💶': 'euro banknote money european',
  '💷': 'pound banknote money british',
  '🏧': 'atm sign bank cash withdraw',
  '💱': 'currency exchange convert money',

  // Flags & symbols
  '♠️': 'spade suit card black',
  '♦️': 'diamond suit card red',
  '♣️': 'club suit card black',
  '🃏': 'joker card wild',
  '🀄': 'mahjong red dragon tile',
  '☯️': 'yin yang balance harmony',
  '🔯': 'star david hexagram six pointed',
  '☮️': 'peace symbol sign',
  '✝️': 'latin cross christian',
  '☪️': 'star crescent islam muslim',
  '🕉️': 'om hindu sacred symbol',
  '☸️': 'wheel dharma buddhism',
  '✡️': 'star david jewish',
  '🈳': 'japanese vacancy kanji empty',
  '🈵': 'japanese full kanji no vacancy',
  '🈴': 'japanese passing grade kanji',
  '🈲': 'japanese prohibited kanji forbidden',
  '🉐': 'japanese bargain kanji advantage',
  '㊗️': 'japanese congratulations kanji',

  // Colors
  '🟤': 'brown circle dot',
  '🔶': 'large orange diamond shape',
  '🔷': 'large blue diamond shape',
  '🔸': 'small orange diamond shape',
  '⭕': 'circle red hollow ring',
}

const allEmojis = computed(() => categories.flatMap(c => c.emojis))

const filteredEmojis = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return allEmojis.value
  return allEmojis.value.filter(emoji => {
    const keywords = emojiKeywords[emoji]
    if (!keywords) return false
    return keywords.split(' ').some(kw => kw.startsWith(q)) || keywords.includes(q)
  })
})

function toggle() {
  showPicker.value = !showPicker.value
  if (showPicker.value) {
    searchQuery.value = ''
    activeCategory.value = categories[0].id
    nextTick(() => {
      searchInput.value?.focus()
      gridContainer.value?.scrollTo(0, 0)
    })
  }
}

function selectEmoji(emoji: string) {
  emit('update:modelValue', emoji)
  showPicker.value = false
}

function clearEmoji() {
  emit('update:modelValue', null)
  showPicker.value = false
}

function scrollToCategory(categoryId: string) {
  const el = categoryRefs.get(categoryId)
  if (el && gridContainer.value) {
    const containerRect = gridContainer.value.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    gridContainer.value.scrollTo({
      top: gridContainer.value.scrollTop + (elRect.top - containerRect.top),
      behavior: 'smooth',
    })
    activeCategory.value = categoryId
  }
}

function handleScroll() {
  if (!gridContainer.value || searchQuery.value) return
  const containerTop = gridContainer.value.getBoundingClientRect().top
  let closest = categories[0].id
  for (const cat of categories) {
    const el = categoryRefs.get(cat.id)
    if (el) {
      const elTop = el.getBoundingClientRect().top
      if (elTop <= containerTop + 10) {
        closest = cat.id
      }
    }
  }
  activeCategory.value = closest
}

watch(searchQuery, () => {
  if (searchQuery.value && gridContainer.value) {
    gridContainer.value.scrollTop = 0
  }
})

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

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
