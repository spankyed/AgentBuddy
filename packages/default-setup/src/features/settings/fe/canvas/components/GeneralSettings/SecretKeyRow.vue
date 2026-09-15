<template>
  <div class="grid grid-cols-[24px,1fr,200px,80px] items-center gap-x-3" :data-testid="`secret-${secret.label}`">
    <input
      v-if="selectable"
      type="radio"
      :checked="secret.selected"
      :title="secret.selected ? 'Used for calls' : 'Use this key'"
      class="h-3.5 w-3.5 accent-blue-500"
      @change="emit('select')"
    />
    <span v-else></span>

    <input
      v-if="renaming"
      v-model="label"
      class="px-2 py-1 bg-neutral-800 border border-neutral-700/50 rounded-md text-white text-sm focus:outline-none focus:border-blue-500/50"
      @keyup.enter="saveLabel"
      @keyup.escape="renaming = false"
    />
    <button v-else class="text-left text-sm text-gray-200 hover:text-white" title="Rename" @click="startRename">
      {{ secret.label }}
      <span v-if="selectable && secret.selected" class="ml-1 text-[11px] text-blue-400/80">selected</span>
    </button>

    <div class="relative">
      <input
        v-if="replacing"
        v-model="value"
        :type="visible ? 'text' : 'password'"
        placeholder="Enter the new key"
        class="w-full pr-8 px-2 py-1 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-blue-500/50"
        @keyup.enter="saveValue"
        @keyup.escape="cancelReplace"
      />
      <span v-else class="w-full inline-block text-center text-xs text-gray-500 bg-neutral-800 px-3 py-1 rounded-md border border-neutral-700">••••••••</span>
      <button v-if="replacing" type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5" @click="visible = !visible">
        <Eye v-if="!visible" class="w-3.5 h-3.5 text-gray-400" />
        <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>

    <div class="flex justify-end gap-1">
      <template v-if="renaming || replacing">
        <button class="p-1.5 hover:bg-neutral-800 rounded-md" title="Save" :disabled="renaming ? !label.trim() : !value.trim()" @click="renaming ? saveLabel() : saveValue()">
          <Check class="w-3.5 h-3.5 text-green-400" />
        </button>
        <button class="p-1.5 hover:bg-neutral-800 rounded-md" title="Cancel" @click="renaming = false; cancelReplace()">
          <X class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </template>
      <template v-else>
        <button class="p-1.5 hover:bg-neutral-800 rounded-md" title="Replace key" @click="replacing = true">
          <Edit2 class="w-3.5 h-3.5 text-gray-400" />
        </button>
        <button class="p-1.5 hover:bg-neutral-800 rounded-md" title="Delete key" @click="emit('delete')">
          <Trash2 class="w-3.5 h-3.5 text-red-400" />
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Check, Edit2, Eye, EyeOff, Trash2, X } from 'lucide-vue-next'
import type { SecretInfo } from '@abuddy/sdk/services'

const props = defineProps<{ secret: SecretInfo; selectable: boolean }>()
const emit = defineEmits<{ select: []; rename: [label: string]; replace: [value: string]; delete: [] }>()

const renaming = ref(false)
const replacing = ref(false)
const visible = ref(false)
const label = ref('')
const value = ref('')

function startRename() {
  label.value = props.secret.label
  renaming.value = true
}

function saveLabel() {
  if (!label.value.trim()) return
  emit('rename', label.value.trim())
  renaming.value = false
}

function saveValue() {
  if (!value.value.trim()) return
  emit('replace', value.value.trim())
  cancelReplace()
}

function cancelReplace() {
  replacing.value = false
  visible.value = false
  value.value = ''
}
</script>
