<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">Create Thread</h2>
        <p class="text-xs text-neutral-400">
          <span v-if="parentThread">Creating as child of {{ parentThread.shortCode }} - {{ parentThread.topic || 'Untitled' }}</span>
          <span v-else>Add a new work thread for the agent</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="actor.send({ type: 'CANCEL_CREATE' })"
          variant="transparent"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          :disabled="isSaving"
          variant="primary"
          @click="actor.send({ type: 'CREATE_THREAD' })"
        >
          Create Thread
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="max-w-4xl p-6 mx-auto">
        <div class="space-y-6">
          <!-- Topic & Type Section -->
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Topic</label>
                <input
                  :value="topic"
                  @input="e => updateField('topic', (e.target as HTMLInputElement).value)"
                  type="text"
                  placeholder="Enter thread topic"
                  class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Type</label>
                <select
                  :value="threadType"
                  @input="e => updateField('threadType', (e.target as HTMLSelectElement).value)"
                  class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
                >
                  <option value="work-item">Task</option>
                  <option value="project">Project</option>
                </select>
              </div>
            </div>

            <!-- Instructions & Status -->
            <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Instructions</label>
                <textarea
                  :value="instructions"
                  @input="e => updateField('instructions', (e.target as HTMLTextAreaElement).value)"
                  rows="4"
                  placeholder="Enter instructions for the agent"
                  class="min-h-[8rem] w-full px-4 py-3 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
                ></textarea>
              </div>
              <div>
                <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Status</label>
                <select
                  disabled
                  value="backlog"
                  class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md opacity-50 cursor-not-allowed bg-neutral-800 border-neutral-700 text-neutral-300"
                >
                  <option value="backlog">Backlog</option>
                </select>
              </div>
            </div>

            <!-- Tags -->
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Tags</label>
              <TagInput 
                v-model="tagNames"
                :available-tags="availableTags"
                @update:modelValue="updateTags"
                class="w-full"
              />
            </div>
          </div>

          <!-- Linked Threads Section -->
          <div class="pt-6 border-t border-neutral-800">
            <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Linked Threads</label>
            <ThreadLinkInput
              :lite="true"
              v-model="linkedThreads"
              :available-threads="threadsList"
              @update:modelValue="(links) => updateField('linkedThreads', links)"
            />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { X, Plus, Square } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import Label from '@/core/design/label.vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { ThreadTagItem, ThreadEditFields } from '@app/api'
import Button from '@/core/design/button.vue';
import TagInput from './tag-input.vue';
import ThreadLinkInput from '@/plugins/threads/canvas/link-thread-input.vue'

const actor: ThreadsState = applicationState.system.get(id);
const topic = useSelector(actor, (state) => state.context.create.topic);
const instructions = useSelector(actor, (state) => state.context.create.instructions);
const threadType = useSelector(actor, (state) => state.context.create.threadType);
const tags = useSelector(actor, (state) => state.context.create.tags);
const availableTags = useSelector(actor, (state) => state.context.availableTags);
const linkedThreads = useSelector(actor, (state) => state.context.create.linkedThreads || []);
const threadsList = useSelector(actor, (state) => state.context.threads || []);

const isSaving = ref(false)

// Get parent thread from context if creating as child
const parentThread = useSelector(actor, (state) => state.context.create.parentThread);

// Transform tags array to string array for TagInput
const tagNames = computed(() => {
  const tagList = tags.value || [];
  return tagList;
});

// Update tags in state when TagInput changes
const updateTags = (newTags: ThreadTagItem[]) => {
  console.log('newTags: ', newTags);
  actor.send({ 
    type: 'UPDATE_THREAD_FIELD',
    state: 'create',
    key: 'tags',
    value: newTags,
  });
};

const addThread = () => {
  actor.send({ type: 'LINK_THREAD' })
}

const removeThread = (index: number) => {
  actor.send({ type: 'REMOVE_LINK', index })
}

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields]) => {
  console.log('updateField', key, value);
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'create' });
}

</script> 