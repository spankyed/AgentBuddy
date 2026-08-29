<template>
  <div class="flex flex-col h-full bg-neutral-900" @keydown="handleKeydown">
    <!-- Header -->
    <NameSaveHeader :isEditing="!!action" :isValid="isValid" @back="$emit('back')" @save="handleSave">
      <input
        :value="formData.label"
        @input="$emit('update-label', ($event.target as HTMLInputElement).value)"
        type="text"
        data-onboarding-id="action-label-input"
        class="flex-1 min-w-0 px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        placeholder="Enter action name"
      />
      <select
        :value="formData.category || ''"
        @input="$emit('update-category', ($event.target as HTMLSelectElement).value)"
        class="px-3 py-2 text-sm font-medium transition-colors border rounded-md shrink-0 bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
      >
        <option value="">No Category</option>
        <option
          v-for="category in categories"
          :key="category.name"
          :value="category.name"
        >
          {{ category.name }}
        </option>
      </select>
    </NameSaveHeader>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl p-4 mx-auto">
        <div class="space-y-6">
          <!-- Parameters -->
          <div class="pt-2">
            <CollapsibleSection v-model="parametersExpanded" label="Input Parameters">
              <ActionParametersEditor
                :parameters="formData.input"
                @update="$emit('update-parameters', $event)"
              />
            </CollapsibleSection>
          </div>

          <!-- Action Function -->
          <div class="pt-6 border-t border-neutral-800">
            <div class="flex items-center gap-3 mb-2">
              <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">
                Function Template<span class="text-red-400">*</span>
              </label>
              <button
                v-if="action"
                @click="openInEditor"
                class="flex items-center gap-1 px-1.5 py-0.5 text-xs transition-colors rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
              >
                <ExternalLink class="w-3 h-3" />
                Open in editor
              </button>
            </div>
            <p class="mb-4 text-xs text-neutral-500" data-onboarding-id="action-services-info">
              An async JavaScript function body that receives `params` object and `services` (logger, database, LLM, http) object.
            </p>
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 400px;" data-onboarding-id="action-function-editor">
              <ActionFunctionEditor
                :value="formData.actionFn"
                :input-params="formData.input"
                @update="$emit('update-action', $event)"
              />
            </div>
          </div>

          <!-- Output Schema -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection v-model="outputExpanded" label="Output Schema (Optional)" :defaultOpen="!!formData.output">
              <div class="space-y-4">
                <JsonSchemaEditor
                  :value="formData.output"
                  @update="$emit('update-output', $event)"
                />
              </div>
            </CollapsibleSection>
          </div>

          <!-- Description -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection label="Description" :defaultOpen="false">
              <textarea
                :value="formData.description"
                @input="$emit('update-description', ($event.target as HTMLTextAreaElement).value)"
                rows="3"
                data-onboarding-id="action-description-input"
                class="w-full px-4 py-3 text-sm transition-colors border rounded-md resize-y bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                placeholder="Describe what this action does..."
              />
            </CollapsibleSection>
          </div>

          <!-- Metadata -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection v-model="metadataExpanded" label="Metadata">
              <div class="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-neutral-500 w-full">
                <span>ID <span class="font-mono text-neutral-400">{{ action?.id }}</span></span>
                <span>Created <span class="text-neutral-400">{{ formatDate(action?.createdAt) }}</span></span>
                <span>Updated <span class="text-neutral-400">{{ formatDate(action?.updatedAt) }}</span></span>
              </div>
            </CollapsibleSection>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActionEntity, ActionParameter, Category } from '@app/api';
import { ExternalLink } from 'lucide-vue-next';
import NameSaveHeader from '@/core/components/design/NameSaveHeader.vue';
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue';
import ActionParametersEditor from './ActionParametersEditor.vue';
import ActionFunctionEditor from './ActionFunctionEditor.vue';
import ActionFunctionViewer from './ActionFunctionViewer.vue';
import JsonSchemaEditor from '@/core/components/design/JsonSchemaEditor.vue';
import { applicationState } from '@/main';
import { navigateToPlugin } from '@/core/utils/navigate';
import { useCollapsibleState } from '@/core/composables/useCollapsibleState';
import { id as actionsId, type ActionsState } from '@/plugins/actions/state';

const props = defineProps<{
  action?: ActionEntity;
  formData: {
    label: string;
    description?: string;
    category?: string;
    input: Record<string, ActionParameter>;
    actionFn: string;
    output?: any;
  };
  categories: Category[];
}>();

const emit = defineEmits<{
  'update-label': [value: string];
  'update-description': [value: string];
  'update-category': [value: string];
  'update-parameters': [value: Record<string, ActionParameter>];
  'update-action': [value: string];
  'update-output': [value: any];
  save: [];
  back: [];
}>();

// Get the actions state machine actor
const actor: ActionsState = applicationState.system.get(actionsId);

// Use the composable for managing collapsible section states
const parametersExpanded = useCollapsibleState(actor, ['formData', 'parametersExpanded'], 'TOGGLE_PARAMETERS_SECTION');
const outputExpanded = useCollapsibleState(actor, ['formData', 'outputExpanded'], 'TOGGLE_OUTPUT_SECTION');
const metadataExpanded = useCollapsibleState(actor, ['formData', 'metadataExpanded'], 'TOGGLE_METADATA_SECTION');

const isValid = computed(() => {
  return props.formData.label.trim() !== '' && props.formData.actionFn.trim() !== '';
});

function handleSave() {
  if (isValid.value) {
    emit('save');
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    handleSave();
  }
}

function openInEditor() {
  if (!props.action) return;

  navigateToPlugin('code', { type: 'UPDATE_STATE', updates: { selectedPanel: 'actions' } });

  // Child actor needs time to initialize after plugin activation
  setTimeout(() => {
    const actionsActor = applicationState.system.get('code')?.system.get('codeActions');
    if (actionsActor) {
      actionsActor.send({ type: 'codeActions.OPEN_ACTION', actionId: props.action!.id });
    }
  }, 10);
}

function formatDate(timestamp?: number) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

function categoryStyle(category?: string) {
  const styles: Record<string, string> = {
    'database': 'bg-blue-900/30 text-blue-400 border border-blue-800/50',
    'communication': 'bg-green-900/30 text-green-400 border border-green-800/50',
    'integration': 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/50',
    'utility': 'bg-purple-900/30 text-purple-400 border border-purple-800/50',
    'storage': 'bg-indigo-900/30 text-indigo-400 border border-indigo-800/50',
  }
  return styles[category || ''] || 'bg-neutral-800 text-neutral-400 border border-neutral-700'
}
</script>
