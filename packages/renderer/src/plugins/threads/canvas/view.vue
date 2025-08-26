<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800 bg-neutral-900">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">Thread Details</h2>
        <p class="text-xs text-neutral-400">
          <span v-if="shortCode" class="text-neutral-500">{{ shortCode }} • </span>
          {{ topic || 'Untitled thread' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="actor.send({ type: 'GO_BACK' })"
          variant="transparent"
        >
          Back
        </Button>
        <Button 
          @click="actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
          variant="primary"
        >
          <MessageCircleMore class="w-4 h-4" />
          <span>Open Chat</span>
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="max-w-4xl p-6 mx-auto space-y-6">
        <!-- Topic & Status Section -->
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Topic</label>
              <div
                v-show="!isEditingTopic"
                @click="startEditingTopic"
                class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 cursor-text hover:border-neutral-600"
              >
                {{ topic || 'Untitled thread' }}
              </div>
              <input
                ref="topicInput"
                v-show="isEditingTopic"
                :value="topic"
                @input="e => updateField('topic', (e.target as HTMLInputElement).value)"
                @blur="isEditingTopic = false"
                @keydown.enter="isEditingTopic = false"
                type="text"
                placeholder="Enter thread topic"
                class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-600 text-neutral-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Status</label>
              <select
                :value="status"
                @input="e => updateField('status', (e.target as HTMLSelectElement).value ?? '')"
                class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
              >
                <option 
                  v-for="statusOption in (settings?.statuses || [])" 
                  :key="statusOption.label" 
                  :value="statusOption.label"
                >
                  {{ statusOption.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Instructions -->
          <div>
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Instructions</label>
            <div
              v-show="!isEditingInstructions"
              @click="startEditingInstructions"
              class="min-h-[8rem] px-4 py-3 rounded-md bg-neutral-800 border border-neutral-700 cursor-text hover:border-neutral-600 transition-colors"
            >
              <p class="text-sm whitespace-pre-wrap text-neutral-300">{{ instructions || 'Click to add agent instructions...' }}</p>
            </div>
            <textarea
              ref="instructionsInput"
              v-show="isEditingInstructions"
              :value="instructions"
              @input="e => updateField('instructions', (e.target as HTMLTextAreaElement).value)"
              @blur.passive="isEditingInstructions = false"
              placeholder="Enter instructions for the agent"
              class="min-h-[8rem] w-full px-4 py-3 text-sm rounded-md bg-neutral-800 border border-neutral-600 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
            ></textarea>
          </div>

          <!-- Tags -->
          <CollapsibleSection label="Tags" :default-open="false" class="pt-2">
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
import { ref, nextTick } from 'vue'
import { MessageCircleMore, Plus } from 'lucide-vue-next'
import { applicationState } from '@/main'
import Label from '@/core/components/design/label.vue'
import type { Ref } from 'vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import { useSelector } from '@xstate/vue'
import Button from '@/core/components/design/button.vue'
import MessageList from './message-list.vue'
import TagInput from '@/core/components/design/tag-input.vue'
import ThreadLinkInput from '@/plugins/threads/canvas/link-thread-input.vue'
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

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields] | undefined) => {
  console.log('updateField', key, value);
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'view' });
}

const isEditingTopic = ref(false);
const isEditingInstructions = ref(false);
const topicInput: Ref<HTMLInputElement | null> = ref(null);
const instructionsInput: Ref<HTMLTextAreaElement | null> = ref(null);
const messagesSection: Ref<HTMLDivElement | null> = ref(null);

const startEditingTopic = () => {
  isEditingTopic.value = true;
  nextTick(() => {
    topicInput.value?.focus();
  });
};

const startEditingInstructions = () => {
  isEditingInstructions.value = true;
  nextTick(() => {
    instructionsInput.value?.focus();
  });
};

// Scroll messages section into view when opened
const onMessagesToggle = (isOpen: boolean) => {
  if (isOpen && messagesSection.value) {
    nextTick(() => {
      messagesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
};
</script>