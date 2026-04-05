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
      '😊', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '😉', '😇', '🥰', '😍', '🤩', '😘', '😋',
      '😎', '🤓', '🧐', '🤔', '🤗', '🤫', '🤭', '😏',
      '😐', '😑', '😶', '😬', '🙄', '😮', '😯', '😲',
      '🥺', '😢', '😭', '😤', '😡', '🤬', '😈', '👿',
      '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽',
      '👾', '🤖', '🎃', '😷', '🤒', '🤕', '🤢', '🤮',
      '🥴', '😵', '🤯', '🥳', '🥸', '😴', '🥱', '😶‍🌫️',
    ],
  },
  {
    id: 'people', icon: '👤', name: 'People & Gestures',
    emojis: [
      '👍', '👎', '👋', '✋', '🤝', '👏', '🙏', '✌️',
      '🤞', '🤙', '👆', '👇', '👈', '👉', '☝️', '🫶',
      '🤟', '🤘', '🫰', '🫵', '🫱', '🫲', '🫳', '🫴',
      '✊', '👊', '🤛', '🤜', '🤚', '👐', '🙌', '💪',
      '🧑‍💻', '👤', '👥', '🧠', '👀', '👁️', '👶', '🧒',
      '👨‍🔬', '👩‍🎨', '👨‍🏫', '👩‍🚀', '🧑‍🔧', '👩‍💼', '🧑‍🍳', '👨‍⚕️',
      '👩‍🌾', '👨‍🎤', '👩‍💻', '🧑‍🎓', '👨‍🍳', '👩‍🔬', '🧑‍🚒', '👮',
      '💃', '🕺', '🧎', '🧍', '🚶', '🏃', '🤸', '🤹',
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
      '🌼', '🌻', '🪻', '🌾', '🪴', '🍄', '🪨', '🌋',
      '🌄', '🌅', '🌌', '🌠', '🌉', '🏔️', '⛰️', '🏜️',
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
      '🦈', '🐛', '🦗', '🐜', '🐌', '🦥', '🦦', '🦫',
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
    ],
  },
  {
    id: 'travel', icon: '🚗', name: 'Travel & Places',
    emojis: [
      '🏠', '🏡', '🏢', '🏗️', '🗺️', '🧭', '✈️', '🚂',
      '🚗', '🚌', '🚁', '🛥️', '🚲', '🏍️', '🚕', '🚃',
      '⛵', '🚤', '🛶', '🚀', '🛸', '🚁', '🛩️', '🚅',
      '🚇', '🚊', '🚉', '🚏', '🛣️', '🛤️', '⛽', '🚧',
      '🗼', '🗽', '🏰', '🏛️', '⛩️', '🕌', '🕍', '⛪',
      '🏟️', '🏪', '🏥', '🏫', '🏨', '🏦', '🏭', '🏬',
      '🗿', '🎪', '🎡', '🎢', '🎠', '⛲', '🌁', '🌃',
      '🏕️', '⛺', '🏖️', '🏝️', '🛖', '🛕', '⛰️', '🗻',
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
    ],
  },
  {
    id: 'tech', icon: '💻', name: 'Tech & Communication',
    emojis: [
      '💬', '📧', '📱', '💻', '🖥️', '🌐', '📡', '🔗',
      '📮', '📞', '📺', '🔔', '📣', '🗣️', '💭', '🛜',
      '💾', '📀', '💿', '🖨️', '⌨️', '🖱️', '🔋', '🪫',
      '🔌', '📟', '📠', '📲', '☎️', '📳', '📴', '📵',
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
      '💍', '👟', '👠', '👢', '🎒', '👜', '🧲', '📿',
    ],
  },
  {
    id: 'time', icon: '⏰', name: 'Time & Calendar',
    emojis: [
      '⏰', '📅', '🗓️', '⏳', '⌛', '🕐', '🕑', '🕒',
      '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚',
      '🕛', '⏱️', '⏲️', '🕰️', '📆', '🗓️', '🔔', '🔕',
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
    id: 'flags', icon: '🚩', name: 'Flags & Colors',
    emojis: [
      '🏁', '🚩', '🏳️', '🏴', '🎌', '⚜️', '🔱', '🏴‍☠️',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
      '🟤', '🔶', '🔷', '🔸', '🔹', '⭕', '🟥', '🟧',
      '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '💠',
      '♠️', '♥️', '♦️', '♣️', '🃏', '🀄', '☯️', '🔯',
      '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '☢️',
      '☣️', '⚛️', '🈳', '🈵', '🈴', '🈲', '🉐', '㊗️',
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
