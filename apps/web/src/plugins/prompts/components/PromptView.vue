<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">{{ prompt?.label }}</h2>
        <p class="text-xs text-neutral-400">Prompt Details</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="$emit('back')"
          variant="transparent"
        >
          Back
        </Button>
        <Button
          @click="$emit('edit')"
          variant="primary"
        >
          <Edit2 class="w-4 h-4" />
          Edit Prompt
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" v-if="prompt">
      <div class="max-w-4xl p-6 mx-auto space-y-6">
        <!-- Basic Info -->
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <h3 class="mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Description</h3>
            <p class="text-sm text-neutral-300">{{ prompt.description || 'No description' }}</p>
          </div>
          <div>
            <h3 class="mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Category</h3>
            <span
              class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md"
              :class="categoryStyle(prompt.category)"
            >
              {{ prompt.category || 'Uncategorized' }}
            </span>
          </div>
        </div>

        <!-- Parameters -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection label="Input Parameters">
            <div v-if="Object.keys(prompt.inputs || {}).length > 0" class="space-y-3">
              <div
                v-for="(input, key) in prompt.inputs"
                :key="key"
                class="p-4 border rounded-md bg-neutral-800/50 border-neutral-700"
              >
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-neutral-100">{{ key }}</span>
                      <span class="text-xs text-neutral-500">({{ input.type }})</span>
                      <span v-if="input.required !== false" class="text-xs text-red-400">required</span>
                    </div>
                    <p v-if="input.description" class="text-sm text-neutral-400">{{ input.description }}</p>
                    <p v-if="input.defaultValue !== undefined" class="text-xs text-neutral-500">
                      Default: <code class="px-1 py-0.5 rounded bg-neutral-800 text-neutral-300">{{ input.defaultValue }}</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="p-8 text-center border-2 border-dashed rounded-lg border-neutral-700">
              <p class="text-sm text-neutral-400">No parameters defined</p>
            </div>
          </CollapsibleSection>
        </div>

        <!-- Template Function -->
        <div class="pt-6 border-t border-neutral-800">
          <div class="flex items-center justify-between mb-4">
            <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">Template Function</label>
            <button
              @click="openInEditor"
              class="flex items-center gap-1 px-2 py-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              <ExternalLink class="w-3 h-3" />
              Open in editor
            </button>
          </div>
          <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 300px;">
            <PromptTemplateViewer :value="prompt.templateFn" />
          </div>
        </div>

        <!-- Output Schema -->
        <div v-if="prompt.outputSchema" class="pt-6 border-t border-neutral-800">
          <h3 class="mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Expected Output</h3>
          <pre class="p-4 overflow-auto text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-300">{{ JSON.stringify(prompt.outputSchema, null, 2) }}</pre>
        </div>

        <!-- Metadata -->
        <div class="pt-6 border-t border-neutral-800">
          <h3 class="mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Metadata</h3>
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-xs text-neutral-500">Created</dt>
              <dd class="text-sm text-neutral-300">{{ formatDate(prompt.createdAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-neutral-500">Updated</dt>
              <dd class="text-sm text-neutral-300">{{ formatDate(prompt.updatedAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-neutral-500">ID</dt>
              <dd class="font-mono text-sm text-neutral-300">{{ prompt.id }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Edit2, ExternalLink } from 'lucide-vue-next';
import Button from '@/core/design/button.vue';
import CollapsibleSection from '@/core/design/CollapsibleSection.vue';
import type { PromptEntity } from '@abuddy/api';
import PromptTemplateViewer from './PromptTemplateViewer.vue';
import { applicationState } from '@/app';

const props = defineProps<{
  prompt?: PromptEntity;
}>();

defineEmits<{
  edit: [];
  back: [];
}>();

function categoryStyle(category?: string) {
  const styles: Record<string, string> = {
    'text-processing': 'bg-blue-900/30 text-blue-400 border border-blue-800/50',
    'development': 'bg-green-900/30 text-green-400 border border-green-800/50',
    'assistant': 'bg-purple-900/30 text-purple-400 border border-purple-800/50',
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