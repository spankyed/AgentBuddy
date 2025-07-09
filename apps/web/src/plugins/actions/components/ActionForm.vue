<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">
          {{ mode === 'create' ? 'Create Action' : 'Edit Action' }}
        </h2>
        <p class="text-xs text-neutral-400">{{ mode === 'create' ? 'Create a new action function' : 'Modify action details' }}</p>
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
          {{ mode === 'create' ? 'Create Action' : 'Save Changes' }}
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
            <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Input Parameters
            </label>
            <ActionParametersEditor
              :parameters="formData.input"
              @update="$emit('update-parameters', $event)"
            />
          </div>

          <!-- Action Function -->
          <div class="pt-6 border-t border-neutral-800">
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Action Function <span class="text-red-400">*</span>
            </label>
            <p class="mb-4 text-xs text-neutral-500">
              Write an async JavaScript function body. The function receives `params` object and `services` object with available services (logger, database, email, http, storage).
            </p>
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 400px;">
              <ActionFunctionEditor
                :value="formData.actionFn"
                @update="$emit('update-action', $event)"
              />
            </div>
          </div>

          <!-- Output Schema (Optional) -->
          <div class="pt-6 border-t border-neutral-800">
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Output <span class="text-xs text-neutral-500">(Optional)</span>
            </label>
            <p class="mb-4 text-xs text-neutral-500">
              Define the expected output structure or type.
            </p>
            <textarea
              :value="JSON.stringify(formData.output || {}, null, 2)"
              @input="handleOutputChange"
              rows="4"
              class="w-full px-4 py-3 text-sm font-mono transition-colors border rounded-md resize-y bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
              placeholder='{ "success": "boolean", "data": "any" }'
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Button from '@/core/design/button.vue';
import type { ActionParameter } from '@abuddy/api';
import ActionParametersEditor from './ActionParametersEditor.vue';
import ActionFunctionEditor from './ActionFunctionEditor.vue';

const props = defineProps<{
  formData: {
    label: string;
    description?: string;
    category?: string;
    input: Record<string, ActionParameter>;
    actionFn: string;
    output?: any;
  };
  mode: 'create' | 'edit';
}>();

const emit = defineEmits<{
  'update-label': [value: string];
  'update-description': [value: string];
  'update-category': [value: string];
  'update-parameters': [value: Record<string, ActionParameter>];
  'update-action': [value: string];
  'update-output': [value: any];
  save: [];
  cancel: [];
}>();

const isValid = computed(() => {
  return props.formData.label.trim() !== '' && props.formData.actionFn.trim() !== '';
});

function handleSave() {
  if (isValid.value) {
    emit('save');
  }
}

function handleOutputChange(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value;
  try {
    const parsed = JSON.parse(value);
    emit('update-output', parsed);
  } catch {
    // Invalid JSON, ignore
  }
}
</script>