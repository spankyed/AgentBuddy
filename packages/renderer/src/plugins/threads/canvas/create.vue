<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <NameSaveHeader label="Topic" :isEditing="false" :isValid="isValid" @back="actor.send({ type: 'CANCEL_CREATE' })" @save="actor.send({ type: 'CREATE_THREAD' })">
      <input
        :value="topic"
        @input="e => updateField('topic', (e.target as HTMLInputElement).value)"
        type="text"
        placeholder="Enter thread topic"
        data-onboarding-id="thread-topic-input"
        class="flex-1 min-w-0 px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <select
        disabled
        :value="settings?.statuses?.[0]?.label || 'Backlog'"
        class="px-3 py-2 text-sm font-medium transition-colors border rounded-md shrink-0 bg-neutral-800 border-neutral-700 text-neutral-300 opacity-50 cursor-not-allowed"
      >
        <option
          v-for="status in (settings?.statuses || [])"
          :key="status.label"
          :value="status.label"
        >
          {{ status.label }}
        </option>
        <option v-if="!settings?.statuses?.length" value="Backlog">Backlog</option>
      </select>
    </NameSaveHeader>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="max-w-4xl p-4 mx-auto space-y-6">
        <div class="space-y-4">
          <!-- Instructions -->
          <div>
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Instructions</label>
            <textarea
              :value="instructions"
              @input="e => updateField('instructions', (e.target as HTMLTextAreaElement).value)"
              rows="4"
              placeholder="Enter instructions for the agent"
              data-onboarding-id="thread-instructions-input"
              class="min-h-[8rem] w-full px-4 py-3 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
            ></textarea>
          </div>

          <!-- Tags -->
          <CollapsibleSection v-model="tagsExpanded" :default-open="false" class="pt-2">
            <template #label>
              <div class="flex items-center gap-2">
                <span>Tags</span>
                <div v-if="tags && tags.length > 0" class="flex items-center gap-1">
                  <span class="text-neutral-500 mr-1">•</span>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(tag) in tags.slice(0, 5)"
                      :key="tag"
                      :style="getTagStyles(tag)"
                      class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md truncate"
                    >
                      {{ tag }}
                    </span>
                    <span v-if="tags.length > 5" class="px-2 py-0.5 text-xs text-neutral-400">
                      +{{ tags.length - 5 }} more
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <TagInput
              data-onboarding-id="thread-tags-section"
              :modelValue="tags || []"
              :available-tags="availableTags"
              @update:modelValue="updateTags"
              class="w-full"
            />
          </CollapsibleSection>
        </div>

        <!-- Linked Threads Section -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection v-model="linkedExpanded" :default-open="false">
            <template #label>
              Linked Threads ({{ linkedThreads.length }})
            </template>
            <ThreadLinkInput
              :lite="true"
              v-model="linkedThreads"
              :available-threads="threadsList"
              :available-tags="availableTags"
              :settings="settings"
              @update:modelValue="(links) => updateField('linkedThreads', links)"
            />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { ThreadEditFields } from '@app/api'
import NameSaveHeader from '@/core/components/design/NameSaveHeader.vue';
import TagInput from '@/core/components/design/tag-input.vue';
import ThreadLinkInput from '@/plugins/threads/canvas/components/link-thread-input.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue';
import { useCollapsibleState } from '@/core/composables/useCollapsibleState';

const actor: ThreadsState = applicationState.system.get(id);
const topic = useSelector(actor, (state) => state.context.create.topic);
const instructions = useSelector(actor, (state) => state.context.create.instructions);
const tags = useSelector(actor, (state) => state.context.create.tags);
const availableTags = useSelector(actor, (state) => state.context.availableTags);
const linkedThreads = useSelector(actor, (state) => state.context.create.linkedThreads || []);
const threadsList = useSelector(actor, (state) => state.context.threads || []);
const settings = useSelector(actor, (state) => state.context.settings);

// Use the composable for managing collapsible section states
const tagsExpanded = useCollapsibleState(actor, ['create', 'tagsExpanded'], 'TOGGLE_TAGS_SECTION');
const linkedExpanded = useCollapsibleState(actor, ['create', 'linkedExpanded'], 'TOGGLE_LINKED_SECTION');

const isSaving = ref(false)
const isValid = computed(() => topic.value.trim() !== '' && !isSaving.value)

// Get parent thread from context if creating as child
const parentThread = useSelector(actor, (state) => state.context.create.parentThread);

// Update tags in state when TagInput changes
const updateTags = (newTags: string[]) => {
  console.log('newTags: ', newTags);
  actor.send({
    type: 'UPDATE_THREAD_FIELD',
    state: 'create',
    key: 'tags',
    value: newTags,
  });
};

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields]) => {
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'create' });
}

const getTagStyles = (tagName: string) => {
  const color = availableTags.value?.find(t => t.name === tagName)?.color || '#A855F7';
  return {
    backgroundColor: `${color}1A`, // 10% opacity
    color,
    border: `1px solid ${color}33` // 20% opacity for border
  };
};

</script>
