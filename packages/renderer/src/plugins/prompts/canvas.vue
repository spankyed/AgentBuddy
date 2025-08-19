<template>
  <div class="flex flex-col justify-center h-full">
    <!-- List View -->
    <PromptsList 
      v-if="state.hasTag('list-prompts')"
      :prompts="prompts"
      :categories="categories"
      @select="handleSelectPrompt"
      @create="handleCreatePrompt"
      @edit="handleEditPrompt"
      @delete="handleDeletePrompt"
    />

    <!-- Create/Edit View -->
    <PromptDetail
      v-else-if="state.hasTag('create-prompt') || state.hasTag('detail-prompt')"
      :prompt="state.hasTag('detail-prompt') ? selectedPrompt : undefined"
      :form-data="formData"
      :categories="categories"
      @update-label="handleUpdateLabel"
      @update-description="handleUpdateDescription"
      @update-inputs="handleUpdateInputs"
      @update-template="handleUpdateTemplate"
      @update-output-schema="handleUpdateOutputSchema"
      @update-category="handleUpdateCategory"
      @save="handleSave"
      @back="handleGoBack"
    />
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { onMounted, watchEffect } from 'vue';
import { id, type PromptsState } from './state';
import { applicationState } from '@/main';
import PromptsList from './components/PromptsList.vue';
import PromptDetail from './components/PromptDetail.vue';
import type { EARS, TemplateInput, PromptsSettings } from '@app/api';

const actor: PromptsState = applicationState.system.get(id);
const state = useSelector(actor, (state) => state);
const prompts = useSelector(actor, (state) => state.context.prompts);
const selectedPrompt = useSelector(actor, (state) => state.context.selectedPrompt);
const formData = useSelector(actor, (state) => state.context.formData);
const categories = useSelector(actor, (state) => state.context.categories);

// Get settings actor to watch for category updates
const settingsActor = applicationState.system.get('settings');
const settings = useSelector(settingsActor, (state: any) => state.context.settings);

// Watch for settings changes and update categories
watchEffect(() => {
  if (settings.value?.plugins?.prompts?.categories) {
    actor.send({ 
      type: 'SETTINGS.CATEGORIES_UPDATED', 
      categories: settings.value.plugins.prompts.categories 
    });
  }
});

// Initialize categories on mount
onMounted(() => {
  if (settings.value?.plugins?.prompts?.categories) {
    actor.send({ 
      type: 'SETTINGS.CATEGORIES_UPDATED', 
      categories: settings.value.plugins.prompts.categories 
    });
  }
});

// List handlers
function handleSelectPrompt(promptId: EARS.EntityId) {
  actor.send({ type: 'PROMPT.SELECT', promptId });
}

function handleCreatePrompt() {
  actor.send({ type: 'PROMPT.CREATE' });
}

function handleEditPrompt(promptId: EARS.EntityId) {
  // Navigate to detail page, then toggle edit mode
  actor.send({ type: 'PROMPT.SELECT', promptId });
  // Note: The detail view will handle editing functionality
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

function handleUpdateCategory(category: string) {
  actor.send({ type: 'FORM.UPDATE_CATEGORY', category });
}

function handleSave() {
  actor.send({ type: 'PROMPT.SAVE' });
}

function handleGoBack() {
  actor.send({ type: 'GO.BACK' });
}
</script> 