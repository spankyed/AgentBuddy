<template>
  <div class="flex flex-col justify-center h-full">
    <!-- List View -->
    <ActionsList 
      v-if="state.hasTag('list-actions')"
      :actions="actions"
      :categories="categories"
      @select="handleSelectAction"
      @create="handleCreateAction"
      @delete="handleDeleteAction"
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
import { useSelector } from '@xstate/vue';
import { onMounted, watchEffect } from 'vue';
import { id, type ActionsState } from './state';
import { applicationState } from '@/main';
import ActionsList from './components/ActionsList.vue';
import ActionDetail from './components/ActionDetail.vue';
import type { EARS, ActionParameter, ActionsSettings } from '@app/api';

const actor: ActionsState = applicationState.system.get(id);
const state = useSelector(actor, (state) => state);
const actions = useSelector(actor, (state) => state.context.actions);
const selectedAction = useSelector(actor, (state) => state.context.selectedAction);
const formData = useSelector(actor, (state) => state.context.formData);
const categories = useSelector(actor, (state) => state.context.categories);

// Get settings actor to watch for category updates
const settingsActor = applicationState.system.get('settings');
const settings = useSelector(settingsActor, (state: any) => state.context.settings);

// Watch for settings changes and update categories
watchEffect(() => {
  if (settings.value?.plugins?.actions?.categories) {
    actor.send({ 
      type: 'SETTINGS.CATEGORIES_UPDATED', 
      categories: settings.value.plugins.actions.categories 
    });
  }
});

// Initialize categories on mount
onMounted(() => {
  if (settings.value?.plugins?.actions?.categories) {
    actor.send({ 
      type: 'SETTINGS.CATEGORIES_UPDATED', 
      categories: settings.value.plugins.actions.categories 
    });
  }
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
  actor.send({ type: 'GO.BACK' });
}
</script>