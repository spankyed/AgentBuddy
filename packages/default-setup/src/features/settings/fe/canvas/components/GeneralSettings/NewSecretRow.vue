<template>
  <div v-if="collapsed && !open">
    <button class="px-2 py-1 text-xs text-neutral-400 hover:text-white rounded-md hover:bg-neutral-800/50 flex items-center gap-1" @click="open = true">
      <Plus class="w-3 h-3" />
      {{ addText }}
    </button>
  </div>
  <div v-else class="grid grid-cols-[24px,1fr,200px,80px] items-center gap-x-3">
    <span></span>
    <input
      v-model="name"
      :placeholder="namePlaceholder"
      class="px-2 py-1 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-blue-500/50"
      @keyup.enter="save"
      @keyup.escape="cancel"
    />
    <div class="relative">
      <input
        v-model="value"
        :type="visible ? 'text' : 'password'"
        :placeholder="valuePlaceholder"
        class="w-full pr-8 px-2 py-1 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-blue-500/50"
        @keyup.enter="save"
        @keyup.escape="cancel"
      />
      <button type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5" @click="visible = !visible">
        <Eye v-if="!visible" class="w-3.5 h-3.5 text-gray-400" />
        <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>
    <div class="flex justify-end gap-1">
      <button class="p-1.5 hover:bg-neutral-800 rounded-md" title="Save" :disabled="!name.trim() || !value.trim()" @click="save">
        <Check class="w-3.5 h-3.5 text-green-400" />
      </button>
      <button v-if="collapsed" class="p-1.5 hover:bg-neutral-800 rounded-md" title="Cancel" @click="cancel">
        <X class="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check, Eye, EyeOff, Plus, X } from 'lucide-vue-next'

// Saves only on Enter or the Save button: a half-typed key is never sent
const props = defineProps<{ namePlaceholder: string; valuePlaceholder: string; defaultName?: string; collapsed: boolean; addText: string }>()
const emit = defineEmits<{ save: [label: string, value: string] }>()

const open = ref(false)
const visible = ref(false)
const name = ref(props.defaultName ?? '')
const value = ref('')

watch(() => props.defaultName, (next) => { if (!value.value) name.value = next ?? '' })

function save() {
  if (!name.value.trim() || !value.value.trim()) return
  emit('save', name.value.trim(), value.value.trim())
  cancel()
}

function cancel() {
  open.value = false
  visible.value = false
  name.value = props.defaultName ?? ''
  value.value = ''
}
</script>
