<template>
  <div>
    <div
      :style="{ paddingLeft: `${level * 20}px` }"
      class="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
    >
      <div class="flex items-center gap-2 flex-1">
        <button
          v-if="collection.childCollections.length > 0"
          @click="expanded = !expanded"
          class="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
        >
          <span v-if="expanded">▼</span>
          <span v-else>▶</span>
        </button>
        <div v-else class="w-5"></div>
        
        <div v-if="!editing" class="flex items-center gap-2 flex-1">
          <button
            @click="emit('select', collection.id)"
            class="font-medium hover:text-blue-500"
          >
            {{ collection.name }}
          </button>
          <span class="text-sm text-gray-500">({{ collection.documentCount }} docs)</span>
          <span v-if="collection.description" class="text-sm text-gray-600">
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
            class="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            v-model="editForm.description"
            type="text"
            placeholder="Description"
            class="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save
          </button>
          <button
            type="button"
            @click="cancelEdit"
            class="px-2 py-1 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </form>
      </div>
      
      <div v-if="!editing" class="flex items-center gap-2">
        <button
          @click="startEdit"
          class="text-sm text-blue-500 hover:underline"
        >
          Edit
        </button>
        <button
          @click="emit('delete', collection.id)"
          class="text-sm text-red-500 hover:underline"
        >
          Delete
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
import type { CollectionDTO } from '@abuddy/api'

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