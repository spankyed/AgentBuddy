<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">
          {{ mode === 'create' ? 'Create Prompt' : 'Edit Prompt' }}
        </h2>
        <p class="text-xs text-neutral-400">{{ mode === 'create' ? 'Create a new prompt template' : 'Modify prompt template details' }}</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="$emit('cancel')"
          variant="transparent"
        >
          Cancel
        </Button>
        <Button
          @click="handleSave"
          :disabled="!isValid"
          variant="primary"
        >
          {{ mode === 'create' ? 'Create Prompt' : 'Save Changes' }}
        </Button>
      </div>
    </div>

    <!-- Form Content -->
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
                  placeholder="Enter prompt name"
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
                  <option value="text-processing">Text Processing</option>
                  <option value="development">Development</option>
                  <option value="assistant">Assistant</option>
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
                placeholder="Describe what this prompt template does..."
              />
            </div>
          </div>

          <!-- Input Parameters -->
          <div class="pt-6 border-t border-neutral-800">
            <CollapsibleSection label="Input Parameters">
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
                v-if="mode === 'edit'"
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
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 300px;">
              <PromptTemplateEditor
                :value="formData.templateFn"
                @update="$emit('update-template', $event)"
              />
            </div>
          </div>

          <!-- Output Schema (Optional) -->
          <div class="pt-6 border-t border-neutral-800">
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Output Schema <span class="text-xs text-neutral-500">(Optional)</span>
            </label>
            <p class="mb-4 text-xs text-neutral-500">
              Define a JSON schema for structured output from the LLM.
            </p>
            <JsonSchemaEditor
              :value="formData.outputSchema"
              @update="$emit('update-output-schema', $event)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink } from 'lucide-vue-next';
import Button from '@/core/design/button.vue';
import CollapsibleSection from '@/core/design/CollapsibleSection.vue';
import type { TemplateInput } from '@abuddy/api';
import PromptInputsEditor from './PromptInputsEditor.vue';
import PromptTemplateEditor from './PromptTemplateEditor.vue';
import JsonSchemaEditor from './JsonSchemaEditor.vue';
import { applicationState } from '@/app';

const props = defineProps<{
  formData: {
    label: string;
    description?: string;
    category?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
  };
  mode: 'create' | 'edit';
  promptId?: string;
}>();

const emit = defineEmits<{
  'update-label': [value: string];
  'update-description': [value: string];
  'update-category': [value: string];
  'update-inputs': [value: Record<string, TemplateInput>];
  'update-template': [value: string];
  'update-output-schema': [value: any];
  save: [];
  cancel: [];
}>();

const isValid = computed(() => {
  return props.formData.label.trim() !== '' && props.formData.templateFn.trim() !== '';
});

function handleSave() {
  if (isValid.value) {
    emit('save');
  }
}

function openInEditor() {
  if (!props.promptId) return;
  
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
          promptId: props.promptId
        });
      }
    }
  }, 10);
}
</script> 