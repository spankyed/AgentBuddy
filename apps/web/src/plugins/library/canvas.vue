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
import { applicationState } from '@/app'
import { id, type LibraryState, type LibraryContext, type LibraryEvents } from './state'
import ListView from './components/ListView.vue'
import CreateView from './components/CreateView.vue'
import EditView from './components/EditView.vue'
import CollectionView from './components/CollectionView.vue'

const actor: LibraryState = applicationState.system.get(id)
const context = useSelector(actor, (state) => state.context)
const send = (event: LibraryEvents) => actor.send(event)

const currentComponent = computed(() => {
  switch (context.value.currentView) {
    case 'create':
      return CreateView
    case 'edit':
      return EditView
    case 'collections':
      return CollectionView
    default:
      return ListView
  }
})

const currentProps = computed(() => {
  const base = {
    documents: context.value.documents,
    collections: context.value.collections,
    selectedCollectionId: context.value.selectedCollectionId,
  }
  
  switch (context.value.currentView) {
    case 'edit':
      return {
        ...base,
        document: context.value.editingDocument,
      }
    case 'list':
      return {
        ...base,
        searchQuery: context.value.searchQuery,
        selectedTags: context.value.selectedTags,
      }
    default:
      return base
  }
})

const currentEvents = computed(() => ({
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
}))
</script>