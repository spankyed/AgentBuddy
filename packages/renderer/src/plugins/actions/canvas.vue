<template>
  <div class="flex flex-col justify-center h-full">
    <!-- List View -->
    <ActionsList 
      v-if="state.hasTag('list-actions')"
      :actions="actions"
      @select="handleSelectAction"
      @create="handleCreateAction"
      @delete="handleDeleteAction"
    />

    <!-- Create View -->
    <ActionDetail
      v-else-if="state.hasTag('create-action')"
      :action="null"
      :form-data="formData"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-parameters="handleUpdateParameters"
      @update-action="handleUpdateAction"
      @update-output="handleUpdateOutput"
      @update-category="handleUpdateCategory"
      @save="handleSaveNew"
      @back="handleGoBack"
    />

    <!-- Detail View (always editable) -->
    <ActionDetail
      v-else-if="state.hasTag('detail-action')"
      :action="selectedAction"
      :form-data="formData"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-parameters="handleUpdateParameters"
      @update-action="handleUpdateAction"
      @update-output="handleUpdateOutput"
      @update-category="handleUpdateCategory"
      @save="handleUpdateActionSave"
      @back="handleGoBack"
    />
  </div>
</template>

<script setup lang="ts">
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

function handleSaveNew() {
  actor.send({ type: 'ACTION.SAVE_NEW' });
}

function handleUpdateActionSave() {
  actor.send({ type: 'ACTION.UPDATE' });
}

function handleGoBack() {
  actor.send({ type: 'GO.BACK' });
}
</script>