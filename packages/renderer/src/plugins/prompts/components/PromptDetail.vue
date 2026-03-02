<template>
  <div class="flex flex-col h-full bg-neutral-900" @keydown="handleKeydown">
    <!-- Header -->
    <div class="grid grid-cols-[minmax(auto,1fr),minmax(0,56rem),minmax(auto,1fr)] py-3 border-b border-neutral-800 items-center">
      <!-- Left: Back button + Name label -->
      <div class="flex items-center justify-between uppercase pl-6 pr-4">
        <button @click="$emit('back')" class="flex items-center gap-1.5 px-2 py-1 transition-colors rounded shrink-0 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">
          <ArrowLeft class="w-4 h-4" />
          <span class="text-xs hidden xl:inline uppercase">Back</span>
        </button>
        <label class="text-xs font-medium tracking-wider shrink-0 text-neutral-400">
          Name
        </label>
      </div>

      <!-- Center: Name input + Category select (aligned with body max-w-4xl) -->
      <div class="flex items-center gap-4 pl-0 pr-6">
        <input
          :value="formData.label"
          @input="$emit('update-label', ($event.target as HTMLInputElement).value)"
          type="text"
          data-onboarding-id="prompt-name-input"
          class="flex-1 min-w-0 px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
          placeholder="Enter prompt name"
        />
        <select
          :value="formData.category || ''"
          @input="$emit('update-category', ($event.target as HTMLSelectElement).value)"
          class="px-3 py-2 text-sm font-medium transition-colors border rounded-md shrink-0 bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">No Category</option>
          <option v-for="category in categories" :key="category.name" :value="category.name">
            {{ category.name }}
          </option>
        </select>
      </div>

      <!-- Right: Save/Create button -->
      <div class="flex justify-end pr-6">
        <Button @click="handleSave" :disabled="!isValid" variant="primary" class="shrink-0">
          <span>{{ prompt ? 'Save' : 'Create' }}</span>
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" v-if="prompt || formData">
      <div class="max-w-4xl p-6 mx-auto space-y-6">
        <div class="space-y-4">
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
              placeholder="Describe what this prompt template does..."
            />
          </div>
        </div>

        <!-- Input Parameters -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection v-model="inputsExpanded" label="Input Parameters">
            <PromptInputsEditor
              :inputs="formData.inputs"
              @update="$emit('update-inputs', $event)"
            />
          </CollapsibleSection>
        </div>

        <!-- Template Function -->
        <div class="pt-6 border-t border-neutral-800">
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">
              Template Function <span class="text-red-400">*</span>
            </label>
            <button
              v-if="prompt"
              @click="openInEditor"
              class="flex items-center gap-1 px-2 py-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              <ExternalLink class="w-3 h-3" />
              Open in editor
            </button>
          </div>
          <p class="mb-4 text-xs text-neutral-500">
            Write a JavaScript function body that returns a template string. The function will receive a `params` object with your defined inputs.
          </p>
          <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 300px;" data-onboarding-id="prompt-template-editor">
            <PromptTemplateEditor
              :value="formData.templateFn"
              @update="$emit('update-template', $event)"
            />
          </div>
        </div>

        <!-- Output Schema -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection v-model="outputExpanded" label="Output Schema (Optional)" :defaultOpen="!!formData.outputSchema">
            <div class="space-y-4">
              <JsonSchemaEditor
                :value="formData.outputSchema"
                @update="$emit('update-output-schema', $event)"
              />
            </div>
          </CollapsibleSection>
        </div>

        <!-- Metadata -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection v-model="metadataExpanded" label="Metadata">
            <dl class="grid grid-cols-2 gap-4">
              <div>
                <dt class="text-xs text-neutral-500">Created</dt>
                <dd class="text-sm text-neutral-300">{{ formatDate(prompt?.createdAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-neutral-500">Updated</dt>
                <dd class="text-sm text-neutral-300">{{ formatDate(prompt?.updatedAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-neutral-500">ID</dt>
                <dd class="font-mono text-sm text-neutral-300">{{ prompt?.id }}</dd>
              </div>
            </dl>
          </CollapsibleSection>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, Edit2, ExternalLink } from 'lucide-vue-next';
import Button from '@/core/components/design/button.vue';
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue';
import type { PromptEntity, TemplateInput, Category } from '@app/api';
import PromptInputsEditor from './PromptInputsEditor.vue';
import PromptTemplateEditor from './PromptTemplateEditor.vue';
import PromptTemplateViewer from './PromptTemplateViewer.vue';
import JsonSchemaEditor from '@/core/components/design/JsonSchemaEditor.vue';
import { useCollapsibleState } from '@/core/composables/useCollapsibleState';
import { applicationState } from '@/main';
import { id as promptsId, type PromptsState } from '@/plugins/prompts/state';

const props = defineProps<{
  prompt?: PromptEntity;
  formData: {
    label: string;
    description?: string;
    category?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
  };
  categories: Category[];
}>();

const emit = defineEmits<{
  'update-label': [value: string];
  'update-description': [value: string];
  'update-category': [value: string];
  'update-inputs': [value: Record<string, TemplateInput>];
  'update-template': [value: string];
  'update-output-schema': [value: any];
  save: [];
  back: [];
}>();

// Get the prompts state machine actor
const actor: PromptsState = applicationState.system.get(promptsId);

// Use the composable for managing collapsible section states
const inputsExpanded = useCollapsibleState(actor, ['formData', 'inputsExpanded'], 'TOGGLE_INPUTS_SECTION');
const outputExpanded = useCollapsibleState(actor, ['formData', 'outputExpanded'], 'TOGGLE_OUTPUT_SECTION');
const metadataExpanded = useCollapsibleState(actor, ['formData', 'metadataExpanded'], 'TOGGLE_METADATA_SECTION');

const isValid = computed(() => {
  return props.formData.label.trim() !== '' && props.formData.templateFn.trim() !== '';
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


function categoryStyle(category?: string) {
  const styles: Record<string, string> = {
    'text-processing': 'bg-blue-900/30 text-blue-400 border border-blue-800/50',
    'development': 'bg-green-900/30 text-green-400 border border-green-800/50',
    'assistant': 'bg-purple-900/30 text-purple-400 border border-purple-800/50',
    'analysis': 'bg-orange-900/30 text-orange-400 border border-orange-800/50',
    'creative': 'bg-pink-900/30 text-pink-400 border border-pink-800/50',
    'formatting': 'bg-cyan-900/30 text-cyan-400 border border-cyan-800/50',
  }
  return styles[category || ''] || 'bg-neutral-800 text-neutral-400 border border-neutral-700'
}

function formatDate(timestamp?: number) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

function openInEditor() {
  if (!props.prompt) return;
  
  // First, switch to the code plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'code' });
  
  // Give the code plugin time to activate, then send the prompt to open
  setTimeout(() => {
    const codeActor = applicationState.system.get('code');
    if (codeActor) {
      // First ensure the prompts panel is selected
      codeActor.send({ 
        type: 'UPDATE_STATE', 
        updates: { selectedPanel: 'prompts' } 
      });
      
      // Then send the open prompt event to the prompts child actor
      const promptsActor = codeActor.system.get('codePrompts');
      if (promptsActor) {
        promptsActor.send({ 
          type: 'codePrompts.OPEN_PROMPT', 
          promptId: props.prompt!.id 
        });
      }
    }
  }, 10);
}
</script>