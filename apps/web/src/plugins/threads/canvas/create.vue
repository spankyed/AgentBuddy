<template>
  <div class="max-w-5xl px-6 py-4 mx-auto">
    <div class="space-y-4">
      <!-- Topic & Status -->
      <div class="flex flex-col items-center gap-4 md:flex-row">
        <div class="flex-1">
          <!-- <Label>Topic</Label> -->
          <input
            :value="topic"
            @input="e => updateField('topic', e.target.value)"
            type="text"
            placeholder="Thread Topic"
            class="w-full px-3 py-2 text-xl rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <!-- <Label>Type</Label> -->
          <select
            :value="threadType"
            @input="e => updateField('threadType', e.target.value)"
            class="w-full px-3 py-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="work-item">Work Item</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      <!-- Instructions -->
      <div>
        <!-- <Label>Instructions</Label> -->
        <textarea
          :value="instructions"
          @input="e => updateField('instructions', e.target.value)"
          rows="4"
          placeholder="Enter instructions for the agent"
          class="h-[8rem] w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600 border border-neutral-700 resize-y"
        ></textarea>
      </div>

      <!-- Tags & Status -->
      <div class="flex items-start gap-2">
        <TagInput 
          v-model="tagNames"
          :available-tags="availableTags"
          @update:modelValue="updateTags"
        />

        <!-- Status -->
        <div class="flex items-center justify-end w-1/2">
          <select
            disabled
            value="draft"
            class="w-32 px-3 py-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2">
        <!-- Stop button -->
        <button
          topic="Cancel thread creation"
          type="submit"
          @click="actor.send({ type: 'CANCEL_CREATE' })"
          :class="[
            'px-4 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2 hover:bg-neutral-700 text-neutral-500 hover:text-white',
          ]"
        >
          Cancel
          <Square :size="22" />
        </button>
        <!-- @click="actor.send({ type: 'CREATE_THREAD' })" -->
        <Button
          type="submit"
          :disabled="isSaving"
          variant="primary"
          @click="actor.send({ type: 'CREATE_THREAD' })"
        >
          Create
        </Button>
      </div>

      <div>
        <!-- <button
          type="button"
          @click="addDetail"
          class="px-3 py-1.5 text-sm font-medium text-white rounded bg-neutral-700 hover:bg-neutral-600"
        >
          + Add Detail
        </button> -->
      </div>
    </div>

    <!-- Related Threads -->
    <ThreadLinkInput
      v-model="linkedThreads"
      :available-threads="threadsList"
      @update:modelValue="(links) => updateField('linkedThreads', links)"
      />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import Label from '@/core/design/label.vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { ThreadTagItem, ThreadEditFields } from '@abuddy/api'
import Button from '@/core/design/button.vue';
import TagInput from './tag-input.vue';
import ThreadLinkInput from '@/plugins/threads/canvas/link-thread-input.vue'

const actor: ThreadsState = applicationState.system.get(id);
const topic = useSelector(actor, (state) => state.context.create.topic);
const instructions = useSelector(actor, (state) => state.context.create.instructions);
const threadType = useSelector(actor, (state) => state.context.create.threadType);
const tags = useSelector(actor, (state) => state.context.create.tags);
const availableTags = useSelector(actor, (state) => state.context.availableTags);
const linkedThreads = useSelector(actor, (state) => state.context.create.linkedThreads);
const threadsList = useSelector(actor, (state) => state.context.threads || []);

const isSaving = ref(false)

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