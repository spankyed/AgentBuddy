<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">{{ action ? action.label : 'New Action' }}</h2>
        <p class="text-xs text-neutral-400">{{ action ? 'Edit Action' : 'Create Action' }}</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="$emit('back')"
          variant="transparent"
        >
          Back
        </Button>
        <Button
          @click="handleSave"
          :disabled="!isValid"
          variant="primary"
        >
          {{ action ? 'Save Changes' : 'Create Action' }}
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl p-6 mx-auto">
        <div class="space-y-6">
          <!-- Basic Info Section -->
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
                  Name <span class="text-red-400">*</span>
                </label>
                <input
                  :value="formData.label"
                  @input="$emit('update-label', ($event.target as HTMLInputElement).value)"
                  type="text"
                  class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                  placeholder="Enter action name"
                />
              </div>
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Category</label>
                <select
                  :value="formData.category || ''"
                  @input="$emit('update-category', ($event.target as HTMLSelectElement).value)"
                  class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Uncategorized</option>
                  <option value="database">Database</option>
                  <option value="communication">Communication</option>
                  <option value="integration">Integration</option>
                  <option value="utility">Utility</option>
                  <option value="storage">Storage</option>
                </select>
              </div>
            </div>

            <!-- Description -->
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
                Description
              </label>
              <textarea
                :value="formData.description"
                @input="$emit('update-description', ($event.target as HTMLTextAreaElement).value)"
                rows="3"
                class="w-full px-4 py-3 text-sm transition-colors border rounded-md resize-y bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                placeholder="Describe what this action does..."
              />
            </div>
          </div>

          <!-- Parameters -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection label="Input Parameters">
              <ActionParametersEditor
                :parameters="formData.input"
                @update="$emit('update-parameters', $event)"
              />
            </CollapsibleSection>
          </div>

          <!-- Action Function -->
          <div class="pt-6 border-t border-neutral-800">
            <div class="flex items-center justify-between mb-4">
              <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">
                Action Function <span class="text-red-400">*</span>
              </label>
              <button
                @click="openInEditor"
                class="flex items-center gap-1 px-2 py-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              >
                <ExternalLink class="w-3 h-3" />
                Open in editor
              </button>
            </div>
            <p class="mb-4 text-xs text-neutral-500">
              An async JavaScript function body that receives `params` object and `services` (logger, database, LLM, http) object.
            </p>
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 400px;">
              <ActionFunctionEditor
                :value="formData.actionFn"
                @update="$emit('update-action', $event)"
              />
            </div>
          </div>

          <!-- Output Schema -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection label="Output Schema (Optional)" :defaultOpen="!!formData.output">
              <div class="space-y-4">
                <p class="text-xs text-neutral-500">
                  Define the expected output structure or type.
                </p>
                <JsonSchemaEditor
                  :value="formData.output"
                  @update="$emit('update-output', $event)"
                />
              </div>
            </CollapsibleSection>
          </div>

          <!-- Metadata -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection label="Metadata">
              <dl class="grid grid-cols-2 gap-4">
                <div>
                  <dt class="text-xs text-neutral-500">Created</dt>
                  <dd class="text-sm text-neutral-300">{{ formatDate(action?.createdAt) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-neutral-500">Updated</dt>
                  <dd class="text-sm text-neutral-300">{{ formatDate(action?.updatedAt) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-neutral-500">ID</dt>
                  <dd class="font-mono text-sm text-neutral-300">{{ action?.id }}</dd>
                </div>
              </dl>
            </CollapsibleSection>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActionEntity, ActionParameter } from '@app/api';
import { Edit2, ExternalLink } from 'lucide-vue-next';
import Button from '@/core/design/button.vue';
import CollapsibleSection from '@/core/design/CollapsibleSection.vue';
import ActionParametersEditor from './ActionParametersEditor.vue';
import ActionFunctionEditor from './ActionFunctionEditor.vue';
import ActionFunctionViewer from './ActionFunctionViewer.vue';
import JsonSchemaEditor from '@/core/design/JsonSchemaEditor.vue';
import { applicationState } from '@/main';

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

const isValid = computed(() => {
  return props.formData.label.trim() !== '' && props.formData.actionFn.trim() !== '';
});

function handleSave() {
  if (isValid.value) {
    emit('save');
  }
}

function openInEditor() {
  if (!props.action) return;
  
  // First, switch to the code plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'code' });
  
  // Give the code plugin time to activate, then send the action to open
  setTimeout(() => {
    const codeActor = applicationState.system.get('code');
    if (codeActor) {
      // First ensure the actions panel is selected
      codeActor.send({ 
        type: 'UPDATE_STATE', 
        updates: { selectedPanel: 'actions' } 
      });
      
      // Then send the open action event to the actions child actor
      const actionsActor = codeActor.system.get('codeActions');
      if (actionsActor) {
        actionsActor.send({ 
          type: 'codeActions.OPEN_ACTION', 
          actionId: props.action!.id 
        });
      }
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