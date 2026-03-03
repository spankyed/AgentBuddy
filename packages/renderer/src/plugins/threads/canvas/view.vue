<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <NameSaveHeader label="Topic" :isEditing="true" :isValid="isValid" @back="actor.send({ type: 'VIEW_LIST' })" @save="actor.send({ type: 'VIEW_LIST' })">
      <input
        :value="topic"
        @input="e => updateField('topic', (e.target as HTMLInputElement).value)"
        type="text"
        placeholder="Enter thread topic"
        class="flex-1 min-w-0 px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <select
        :value="status"
        @input="e => updateField('status', (e.target as HTMLSelectElement).value ?? '')"
        class="px-3 py-2 text-sm font-medium transition-colors border rounded-md shrink-0 bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
      >
        <option
          v-for="statusOption in (settings?.statuses || [])"
          :key="statusOption.label"
          :value="statusOption.label"
        >
          {{ statusOption.label }}
        </option>
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
              placeholder="Enter instructions for the agent"
              class="min-h-[8rem] w-full px-4 py-3 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
            ></textarea>
          </div>

          <!-- Tags -->
          <CollapsibleSection :default-open="false" class="pt-2">
            <template #label>
              <div class="flex items-center gap-2">
                <span>Tags</span>
                <div v-if="tags && tags.length > 0" class="flex items-center gap-1">
                  <span class="text-neutral-500 mr-1">•</span>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(tag, index) in tags.slice(0, 5)"
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
              :modelValue="tags || []"
              :available-tags="availableTags"
              @update:modelValue="(newTags) => updateField('tags', newTags)"
              class="w-full"
            />
          </CollapsibleSection>
        </div>

        <!-- Messages Section -->
        <div ref="messagesSection" class="pt-6 border-t border-neutral-800">
          <CollapsibleSection :default-open="false" @toggle="onMessagesToggle">
            <template #label>
              Messages ({{ messages.length }})
            </template>
            <div v-if="messages.length > 0">
              <MessageList :is-messages-open="true" :messages="messages" />
            </div>
            <div v-else class="text-sm text-neutral-500 italic">
              No messages yet
            </div>
          </CollapsibleSection>
        </div>

        <!-- Linked Threads Section -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection :default-open="false">
            <template #label>
              Linked Threads ({{ linkedThreads.length }})
            </template>
            <ThreadLinkInput
              v-model="linkedThreads"
              :available-threads="threadsList"
              :available-tags="availableTags"
              :settings="settings"
              @chat-click="(id) => actor.send({ type: 'OPEN_THREAD_CHAT', threadId: id })"
              @select="(id) => actor.send({ type: 'SELECT_THREAD', id })"
              @status-change="(id, status) => actor.send({ type: 'UPDATE_THREAD_STATUS', id, status })"
              @update:modelValue="(links) => updateField('linkedThreads', links)"
            >
              <template #extra-buttons>
                <button
                  @click="actor.send({ type: 'SHOW_CREATE_FORM_AS_CHILD', parentThreadId: threadId })"
                  type="button"
                  class="flex items-center gap-2 px-4 py-2 ml-auto text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Create Child Thread
                  <Plus :size="16" />
                </button>
              </template>
            </ThreadLinkInput>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Plus } from 'lucide-vue-next'
import { applicationState } from '@/main'
import type { Ref } from 'vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import { useSelector } from '@xstate/vue'
import NameSaveHeader from '@/core/components/design/NameSaveHeader.vue'
import MessageList from './components/message-list.vue'
import TagInput from '@/core/components/design/tag-input.vue'
import ThreadLinkInput from '@/plugins/threads/canvas/components/link-thread-input.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import type { ThreadEditFields } from '@app/api';

const actor: ThreadsState = applicationState.system.get(id);
const threadId = useSelector(actor, (state) => state.context.view.id);
const messages = useSelector(actor, (state) => state.context.view.messages || []);
const availableTags = useSelector(actor, (state) => state.context.availableTags);
const linkedThreads = useSelector(actor, (state) => state.context.view.linkedThreads || []);
const tags = useSelector(actor, (state) => state.context.view.tags || []);
const topic = useSelector(actor, (state) => state.context.view.topic || '');
const shortCode = useSelector(actor, (state) => state.context.view.shortCode || '');
const status = useSelector(actor, (state) => state.context.view.status || 'Backlog');
const instructions = useSelector(actor, (state) => state.context.view.instructions || '');
const threadsList = useSelector(actor, (state) => state.context.threads || []);
const settings = useSelector(actor, (state) => state.context.settings);

const isValid = computed(() => topic.value.trim() !== '');

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields] | undefined) => {
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'view' });
}

const messagesSection: Ref<HTMLDivElement | null> = ref(null);

// Scroll messages section into view when opened
const onMessagesToggle = (isOpen: boolean) => {
  if (isOpen && messagesSection.value) {
    nextTick(() => {
      messagesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
};

const getTagStyles = (tagName: string) => {
  const color = availableTags.value?.find(t => t.name === tagName)?.color || '#A855F7';
  return {
    backgroundColor: `${color}1A`, // 10% opacity
    color,
    border: `1px solid ${color}33` // 20% opacity for border
  };
};
</script>
