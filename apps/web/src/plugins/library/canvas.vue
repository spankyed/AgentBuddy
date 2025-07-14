<template>
  <component
    :is="currentComponent"
    v-bind="currentProps"
    v-on="currentEvents"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { useState } from '@/core/composables/plugins'
import { id, type LibraryState, type LibraryContext, type LibraryEvents } from './state'
import CreateView from './components/CreateView.vue'
import EditView from './components/EditView.vue'
import FileSystemBrowser from './components/FileSystemBrowser.vue'

const actor = useState<LibraryState>(id)
const context = useSelector(actor, (state) => state.context)
const send = (event: LibraryEvents) => actor.send(event)

const currentComponent = computed(() => {
  switch (context.value.currentView) {
    case 'create':
      return CreateView
    case 'edit':
      return EditView
    case 'browser':
    default:
      return FileSystemBrowser
  }
})

const currentProps = computed(() => {
  const base = {
    documents: context.value.documents,
    collections: context.value.collections,
    selectedCollectionId: context.value.currentFolderId || context.value.selectedCollectionId,
  }
  
  switch (context.value.currentView) {
    case 'browser':
      return {
        items: context.value.items,
        currentPath: context.value.currentPath,
        selectedItems: context.value.selectedItems,
        sortBy: context.value.sortBy,
        sortDirection: context.value.sortDirection,
        currentFolderId: context.value.currentFolderId,
        breadcrumbs: context.value.breadcrumbs,
      }
    case 'create':
      return {
        ...base,
      }
    case 'edit':
      return {
        ...base,
        document: context.value.editingDocument,
      }
    default:
      return base
  }
})

const currentEvents = computed(() => {
  const legacyEvents = {
    CREATE_DOCUMENT: () => send({ type: 'CREATE_DOCUMENT' }),
    EDIT_DOCUMENT: (payload: { documentId: string }) => send({ type: 'EDIT_DOCUMENT', ...payload }),
    DELETE_DOCUMENT: (payload: { documentId: string }) => send({ type: 'DELETE_DOCUMENT', ...payload }),
    SAVE_DOCUMENT: (payload: { name: string; content: string; tags: string[]; collectionId?: string }) =>
      send({ type: 'SAVE_DOCUMENT', ...payload }),
    CANCEL_EDIT: () => send({ type: 'CANCEL_EDIT' }),
    VIEW_COLLECTIONS: () => send({ type: 'VIEW_COLLECTIONS' }),
    CREATE_COLLECTION: (payload: { name: string; description?: string; parentId?: string }) =>
      send({ type: 'CREATE_COLLECTION', ...payload }),
    UPDATE_COLLECTION: (payload: { id: string; name: string; description?: string }) =>
      send({ type: 'UPDATE_COLLECTION', ...payload }),
    DELETE_COLLECTION: (payload: { id: string }) =>
      send({ type: 'DELETE_COLLECTION', ...payload }),
    MOVE_DOCUMENT: (payload: { documentId: string; collectionId?: string }) =>
      send({ type: 'MOVE_DOCUMENT', ...payload }),
    SEARCH_DOCUMENTS: (payload: { query: string }) =>
      send({ type: 'SEARCH_DOCUMENTS', ...payload }),
    FILTER_BY_TAG: (payload: { tag: string }) =>
      send({ type: 'FILTER_BY_TAG', ...payload }),
    CLEAR_FILTERS: () => send({ type: 'CLEAR_FILTERS' }),
    SELECT_COLLECTION: (payload: { collectionId?: string }) =>
      send({ type: 'SELECT_COLLECTION', ...payload }),
    TRAIL_CLICK: (payload: { trail: string[] }) =>
      send({ type: 'TRAIL_CLICK', ...payload }),
  }

  const fileBrowserEvents = {
    NAVIGATE_TO_FOLDER: (payload: { folderId: string | null }) => 
      send({ type: 'NAVIGATE_TO_FOLDER', ...payload }),
    DOUBLE_CLICK_ITEM: (payload: { item: any }) => 
      send({ type: 'DOUBLE_CLICK_ITEM', ...payload }),
    SELECT_ITEMS: (payload: { itemIds: string[] }) => 
      send({ type: 'SELECT_ITEMS', ...payload }),
    SORT_BY: (payload: { column: 'name' | 'modified' | 'size' | 'kind' }) => 
      send({ type: 'SORT_BY', ...payload }),
    CREATE_FOLDER: (payload: { name: string }) => 
      send({ type: 'CREATE_FOLDER', ...payload }),
    RENAME_ITEM: (payload: { itemId: string; name: string }) => 
      send({ type: 'RENAME_ITEM', ...payload }),
    DELETE_SELECTED_ITEMS: () => 
      send({ type: 'DELETE_SELECTED_ITEMS' }),
  }

  return {
    ...legacyEvents,
    ...fileBrowserEvents,
  }
})
</script>