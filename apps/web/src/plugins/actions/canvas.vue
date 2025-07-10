<template>
  <div class="flex flex-col justify-center h-full">
    <!-- List View -->
    <ActionsList 
      v-if="state.hasTag('list-actions')"
      :actions="actions"
      @select="handleSelectAction"
      @create="handleCreateAction"
      @edit="handleEditAction"
      @delete="handleDeleteAction"
    />

    <!-- Create View -->
    <ActionForm
      v-else-if="state.hasTag('create-action')"
      :form-data="formData"
      mode="create"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-parameters="handleUpdateParameters"
      @update-action="handleUpdateAction"
      @update-output="handleUpdateOutput"
      @update-category="handleUpdateCategory"
      @save="handleSaveNew"
      @cancel="handleGoBack"
    />

    <!-- View/Read-only -->
    <ActionView
      v-else-if="state.hasTag('view-action')"
      :action="selectedAction"
      @edit="handleEditCurrent"
      @back="handleGoBack"
    />

    <!-- Edit View -->
    <ActionForm
      v-else-if="state.hasTag('edit-action')"
      :form-data="formData"
      mode="edit"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-parameters="handleUpdateParameters"
      @update-action="handleUpdateAction"
      @update-output="handleUpdateOutput"
      @update-category="handleUpdateCategory"
      @save="handleUpdateActionSave"
      @cancel="handleGoBack"
    />
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { id, type ActionsState } from './state';
import { applicationState } from '@/app';
import ActionsList from './components/ActionsList.vue';
import ActionForm from './components/ActionForm.vue';
import ActionView from './components/ActionView.vue';
import type { EARS, ActionParameter } from '@abuddy/api';

const actor: ActionsState = applicationState.system.get(id);
const state = useSelector(actor, (state) => state);
const actions = useSelector(actor, (state) => state.context.actions);
const selectedAction = useSelector(actor, (state) => state.context.selectedAction);
const formData = useSelector(actor, (state) => state.context.formData);

// List handlers
function handleSelectAction(actionId: EARS.EntityId) {
  actor.send({ type: 'ACTION.SELECT', actionId });
}

function handleCreateAction() {
  actor.send({ type: 'ACTION.CREATE' });
}

function handleEditAction(actionId: EARS.EntityId) {
  actor.send({ type: 'ACTION.EDIT', actionId });
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

function handleSaveNew() {
  actor.send({ type: 'ACTION.SAVE_NEW' });
}

function handleUpdateActionSave() {
  actor.send({ type: 'ACTION.UPDATE' });
}

function handleEditCurrent() {
  if (selectedAction.value) {
    actor.send({ type: 'ACTION.EDIT', actionId: selectedAction.value.id });
  }
}

function handleGoBack() {
  actor.send({ type: 'GO.BACK' });
}
</script>