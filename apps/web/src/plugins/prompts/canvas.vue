<template>
  <div class="flex flex-col h-full">
    <!-- List View -->
    <PromptsList 
      v-if="state.hasTag('list-prompts')"
      :prompts="prompts"
      @select="handleSelectPrompt"
      @create="handleCreatePrompt"
      @edit="handleEditPrompt"
      @delete="handleDeletePrompt"
    />

    <!-- Create View -->
    <PromptForm
      v-else-if="state.hasTag('create-prompt')"
      :form-data="formData"
      mode="create"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-inputs="handleUpdateInputs"
      @update-template="handleUpdateTemplate"
      @update-output-schema="handleUpdateOutputSchema"
      @save="handleSaveNew"
      @cancel="handleGoBack"
    />

    <!-- View/Read-only -->
    <PromptView
      v-else-if="state.hasTag('view-prompt')"
      :prompt="selectedPrompt"
      @edit="handleEditCurrent"
      @back="handleGoBack"
    />

    <!-- Edit View -->
    <PromptForm
      v-else-if="state.hasTag('edit-prompt')"
      :form-data="formData"
      mode="edit"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-inputs="handleUpdateInputs"
      @update-template="handleUpdateTemplate"
      @update-output-schema="handleUpdateOutputSchema"
      @save="handleUpdatePrompt"
      @cancel="handleGoBack"
    />
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { id, type PromptsState } from './state';
import { applicationState } from '@/app';
import PromptsList from './components/PromptsList.vue';
import PromptForm from './components/PromptForm.vue';
import PromptView from './components/PromptView.vue';
import type { EARS, TemplateInput } from '@abuddy/api';

const actor: PromptsState = applicationState.system.get(id);
const state = useSelector(actor, (state) => state);
const prompts = useSelector(actor, (state) => state.context.prompts);
const selectedPrompt = useSelector(actor, (state) => state.context.selectedPrompt);
const formData = useSelector(actor, (state) => state.context.formData);

// List handlers
function handleSelectPrompt(promptId: EARS.EntityId) {
  actor.send({ type: 'PROMPT.SELECT', promptId });
}

function handleCreatePrompt() {
  actor.send({ type: 'PROMPT.CREATE' });
}

function handleEditPrompt(promptId: EARS.EntityId) {
  actor.send({ type: 'PROMPT.EDIT', promptId });
}

function handleDeletePrompt(promptId: EARS.EntityId) {
  actor.send({ type: 'PROMPT.DELETE', promptId });
}

// Form handlers
function handleUpdateLabel(label: string) {
  actor.send({ type: 'FORM.UPDATE_LABEL', label });
}

function handleUpdateDescription(description: string) {
  actor.send({ type: 'FORM.UPDATE_DESCRIPTION', description });
}

function handleUpdateInputs(inputs: Record<string, TemplateInput>) {
  actor.send({ type: 'FORM.UPDATE_INPUTS', inputs });
}

function handleUpdateTemplate(templateFn: string) {
  actor.send({ type: 'FORM.UPDATE_TEMPLATE', templateFn });
}

function handleUpdateOutputSchema(outputSchema: any) {
  actor.send({ type: 'FORM.UPDATE_OUTPUT_SCHEMA', outputSchema });
}

function handleSaveNew() {
  actor.send({ type: 'PROMPT.SAVE_NEW' });
}

function handleUpdatePrompt() {
  actor.send({ type: 'PROMPT.UPDATE' });
}

function handleEditCurrent() {
  if (selectedPrompt.value) {
    actor.send({ type: 'PROMPT.EDIT', promptId: selectedPrompt.value.id });
  }
}

function handleGoBack() {
  actor.send({ type: 'GO.BACK' });
}
</script> 