<template>
  <div class="flex flex-col justify-center h-full">
    <!-- List View -->
    <PromptsList
      v-if="state.hasTag('list-prompts')"
      :prompts="filteredPrompts"
      :categories="categories"
      :selected-categories="selectedCategories"
      :has-prompts="prompts.length > 0"
      @select="handleSelectPrompt"
      @create="handleCreatePrompt"
      @edit="handleEditPrompt"
      @delete="handleDeletePrompt"
      @toggle-category="handleToggleCategory"
      @clear-filters="handleClearFilters"
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
import { computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { id, type PromptsState } from './state';
import { applicationState } from '@/main';
import PromptsList from './components/PromptsList.vue';
import PromptDetail from './components/PromptDetail.vue';
import type { EARS, TemplateInput } from '@app/api';

const actor: PromptsState = applicationState.system.get(id);
const state = useSelector(actor, (state) => state);
const prompts = useSelector(actor, (state) => state.context.prompts);
const selectedPrompt = useSelector(actor, (state) => state.context.selectedPrompt);
const formData = useSelector(actor, (state) => state.context.formData);
const categories = useSelector(actor, (state) => state.context.categories);
const selectedCategories = useSelector(actor, (state) => state.context.selectedCategories);

// Filter prompts based on selected categories
const filteredPrompts = computed(() => {
  // If no categories selected, show all prompts
  if (selectedCategories.value.length === 0) {
    return prompts.value;
  }

  // Filter prompts that match selected categories
  return prompts.value.filter(prompt => {
    // If prompt has no category, don't show it when filters are active
    if (!prompt.category) return false;
    return selectedCategories.value.includes(prompt.category);
  });
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