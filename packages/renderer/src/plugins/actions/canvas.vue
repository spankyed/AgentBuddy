<template>
  <div class="flex flex-col justify-center h-full">
    <!-- List View -->
    <ActionsList
      v-if="state.hasTag('list-actions')"
      :actions="filteredActions"
      :categories="categories"
      :selected-categories="selectedCategories"
      :has-actions="actions.length > 0"
      :has-more="hasMore"
      :loading-more="loadingMore"
      @select="handleSelectAction"
      @create="handleCreateAction"
      @delete="handleDeleteAction"
      @toggle-category="handleToggleCategory"
      @clear-filters="handleClearFilters"
      @load-more="handleLoadMore"
    />

    <!-- Create/Edit View -->
    <ActionDetail
      v-else-if="state.hasTag('create-action') || state.hasTag('detail-action')"
      :action="state.hasTag('detail-action') ? selectedAction : undefined"
      :form-data="formData"
      :categories="categories"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-parameters="handleUpdateParameters"
      @update-action="handleUpdateAction"
      @update-output="handleUpdateOutput"
      @update-category="handleUpdateCategory"
      @save="handleSave"
      @back="handleGoBack"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { id, type ActionsState } from './state';
import { applicationState } from '@/main';
import ActionsList from './components/ActionsList.vue';
import ActionDetail from './components/ActionDetail.vue';
import type { EARS, ActionParameter } from '@app/api';

const actor: ActionsState = applicationState.system.get(id);
const state = useSelector(actor, (state) => state);
const actions = useSelector(actor, (state) => state.context.actions);
const selectedAction = useSelector(actor, (state) => state.context.selectedAction);
const formData = useSelector(actor, (state) => state.context.formData);
const categories = useSelector(actor, (state) => state.context.categories);
const selectedCategories = useSelector(actor, (state) => state.context.selectedCategories);
const page = useSelector(actor, (state) => state.context.page);
const totalPages = useSelector(actor, (state) => state.context.totalPages);
const loadingMore = useSelector(actor, (state) => state.context.loadingMore);

const hasMore = computed(() => page.value < totalPages.value);

// Filter actions based on selected categories
const filteredActions = computed(() => {
  // If no categories selected, show all actions
  if (selectedCategories.value.length === 0) {
    return actions.value;
  }

  // Filter actions that match selected categories
  return actions.value.filter(action => {
    // If action has no category, don't show it when filters are active
    if (!action.category) return false;
    return selectedCategories.value.includes(action.category);
  });
});

// List handlers
function handleSelectAction(actionId: EARS.EntityId) {
  actor.send({ type: 'ACTION.SELECT', actionId });
}

function handleCreateAction() {
  actor.send({ type: 'ACTION.CREATE' });
}

function handleDeleteAction(actionId: EARS.EntityId) {
  actor.send({ type: 'ACTION.DELETE', actionId });
}

function handleLoadMore() {
  actor.send({ type: 'ACTIONS.LOAD_MORE' });
}

// Form handlers
function handleUpdateLabel(label: string) {
  actor.send({ type: 'FORM.UPDATE_LABEL', label });
}

function handleUpdateDescription(description: string) {
  actor.send({ type: 'FORM.UPDATE_DESCRIPTION', description });
}

function handleUpdateParameters(input: Record<string, ActionParameter>) {
  actor.send({ type: 'FORM.UPDATE_PARAMETERS', input });
}

function handleUpdateAction(actionFn: string) {
  actor.send({ type: 'FORM.UPDATE_ACTION', actionFn });
}

function handleUpdateOutput(output: any) {
  actor.send({ type: 'FORM.UPDATE_OUTPUT', output });
}

function handleUpdateCategory(category: string) {
  actor.send({ type: 'FORM.UPDATE_CATEGORY', category });
}

function handleSave() {
  actor.send({ type: 'ACTION.SAVE' });
}

function handleGoBack() {
  actor.send({ type: 'VIEW_LIST' });
}

// Filter handlers
function handleToggleCategory(categoryName: string) {
  actor.send({ type: 'FILTER.TOGGLE_CATEGORY', categoryName });
}

function handleClearFilters() {
  actor.send({ type: 'FILTER.CLEAR' });
}
</script>