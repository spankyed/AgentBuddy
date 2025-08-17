<template>
  <div>
    <div
      :style="{ paddingLeft: `${level * 20}px` }"
      class="flex items-center justify-between p-3 transition-colors rounded-md hover:bg-neutral-800"
    >
      <div class="flex items-center gap-2 flex-1">
        <button
          v-if="collection.childCollections.length > 0"
          @click="expanded = !expanded"
          class="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          <ChevronRight class="w-4 h-4 transition-transform" :class="{ 'rotate-90': expanded }" />
        </button>
        <div v-else class="w-5"></div>
        
        <div v-if="!editing" class="flex items-center gap-3 flex-1">
          <Folder class="w-4 h-4 text-neutral-400" />
          <button
            @click="emit('select', collection.id)"
            class="font-medium text-neutral-100 hover:text-blue-400 transition-colors"
          >
            {{ collection.name }}
          </button>
          <span class="text-xs text-neutral-500">({{ collection.documentCount }} docs)</span>
          <span v-if="collection.description" class="text-xs text-neutral-500">
            - {{ collection.description }}
          </span>
        </div>
        
        <form
          v-else
          @submit.prevent="handleUpdate"
          class="flex items-center gap-2 flex-1"
        >
          <input
            v-model="editForm.name"
            type="text"
            required
            class="px-3 py-1 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
          />
          <input
            v-model="editForm.description"
            type="text"
            placeholder="Description"
            class="px-3 py-1 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
          />
          <Button
            type="submit"
            variant="primary"
          >
            Save
          </Button>
          <Button
            type="button"
            @click="cancelEdit"
            variant="transparent"
          >
            Cancel
          </Button>
        </form>
      </div>
      
      <div v-if="!editing" class="flex items-center gap-2">
        <button
          @click="startEdit"
          class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
          aria-label="Edit collection"
          title="Edit collection"
        >
          <Edit2 class="w-4 h-4" />
        </button>
        <button
          @click="emit('delete', collection.id)"
          class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-red-400 hover:bg-red-400/10 active:scale-95"
          aria-label="Delete collection"
          title="Delete collection"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <div v-if="expanded && collection.childCollections.length > 0">
      <CollectionTreeItem
        v-for="child in collection.childCollections"
        :key="child.id"
        :collection="child"
        :level="level + 1"
        @select="emit('select', $event)"
        @update="(id, name, description) => emit('update', id, name, description)"
        @delete="emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ChevronRight, Folder, Edit2, Trash2 } from 'lucide-vue-next'
import Button from '@/core/components/design/button.vue'
import type { CollectionDTO } from '@app/api'

const props = defineProps<{
  collection: CollectionDTO
  level: number
}>()

const emit = defineEmits<{
  select: [id: string]
  update: [id: string, name: string, description?: string]
  delete: [id: string]
}>()

const expanded = ref(true)
const editing = ref(false)
const editForm = reactive({
  name: '',
  description: '',
})

function startEdit() {
  editing.value = true
  editForm.name = props.collection.name
  editForm.description = props.collection.description || ''
}

function cancelEdit() {
  editing.value = false
  editForm.name = ''
  editForm.description = ''
}

function handleUpdate() {
  emit('update', props.collection.id, editForm.name, editForm.description || undefined)
  cancelEdit()
}
</script>