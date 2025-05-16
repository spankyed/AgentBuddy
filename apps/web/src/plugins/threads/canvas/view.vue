<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6 root-container">
    <div class="p-4 space-y-6">
      <!-- Title & Status -->
      <div class="flex flex-col gap-4 md:flex-row">
        <div class="flex-1">
          <Label>Title</Label>
          <input
            v-model="title"
            type="text"
            :placeholder="placeholder"
            class="w-full px-3 py-2 text-sm rounded bg-neutral-900 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <Label>Type</Label>
          <select
            v-model="type"
            class="w-full px-3 py-2 text-sm rounded bg-neutral-900 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="work-item">Work Item</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      <!-- Context -->
      <div>
        <Label>Context</Label>
        <div class="p-2 border rounded-lg bg-neutral-800 border-neutral-700">
          <p class="text-sm italic text-neutral-300">please use css variables from our design systems to remove hardcoded colors</p>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <button 
          @click="isNotesOpen = !isNotesOpen"
          class="flex items-center justify-between px-2 py-0.5 text-sm font-medium rounded text-neutral-300 hover:bg-neutral-700"
        >
          <span>Add Notes</span>
          <ChevronDown 
            :size="16" 
            :class="[`ml-1 transition-transform`, isNotesOpen ? 'rotate-180' : '']"
          />
        </button>

        <div v-if="isNotesOpen" class="p-3 mt-2 rounded-sm bg-neutral-900">
          <textarea
            v-model="notes"
            class="w-full h-64 p-2 text-sm rounded bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-primary-600 resize-handle"
            placeholder="Add thread notes here..."
          ></textarea>
        </div>
      </div>

      <!-- Threads list -->
      <div>
        <Label>Related Threads</Label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="addDetail"
            class="flex items-center gap-2 px-4 py-2 mr-2 text-sm font-medium transition-colors rounded h-7 text-neutral-200 bg-neutral-900/60 hover:bg-neutral-700"
          >
            Link Thread
            <Plus :size="16" class="text-neutral-300" />
          </button>

          <span
            v-for="(thread, index) in threads"
            :key="index"
            class="cursor-pointer inline-flex items-center pl-3 py-0.5 text-sm bg-neutral-900/60 text-neutral-200 rounded"
          >
            {{ thread }}
            <button
              type="button"
              @click="removeThread(index)"
              class="p-1 ml-1 rounded focus:outline-none"
            >
              <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
            </button>
          </span>
        </div>
      </div>

      <!-- Tags list -->
      <div>
        <Label>Tags</Label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="addTag"
            class="flex items-center gap-2 px-4 py-2 mr-2 text-sm font-medium text-purple-200 transition-colors rounded hover:text-purple-100 h-7 bg-purple-900/30 hover:bg-purple-500/30"
          >
            Add Tag
            <Plus :size="16" class="text-purple-300" />
          </button>

          <span
            v-for="(tag, index) in tags"
            :key="index"
            class="inline-flex items-center pl-3 py-0.5 text-sm bg-purple-900/30 text-purple-200 rounded"
          >
            {{ tag }}
            <button
              type="button"
              @click="removeTag(index)"
              class="p-1 ml-1 rounded focus:outline-none"
            >
              <X :size="16" class="text-purple-300 hover:text-purple-100" />
            </button>
          </span>
        </div>
      </div>

      <!-- Messages Container -->
      <div class="mt-6">
        <div class="flex gap-2">
          <button 
            @click="isMessagesOpen = !isMessagesOpen"
            class="flex items-center justify-between px-2 py-0.5 text-sm font-medium rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          >
            <span>View Messages ({{ messages.length }})</span>
            <ChevronDown 
              :size="16" 
              :class="[`ml-1 transition-transform`, isMessagesOpen ? 'rotate-180' : '']"
            />
          </button>
          <button 
            class="ml-auto text-sm font-medium text-white underline"
          >
            Continue to chat
          </button>
        </div>
        <div v-if="isMessagesOpen" class="p-3 pr-0 mt-2 overflow-hidden rounded-sm bg-neutral-900">
          <div class="overflow-y-auto max-h-96 messages-container">
            <ul class="mr-2 space-y-1">
              <li v-for="(message, index) in messages" :key="index" 
                  :class="[
                    'px-3 py-2 text-sm truncate rounded-sm',
                    message.sender === 'user' ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-900 text-neutral-300'
                  ]">
                {{ message.text }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { X, Plus, ChevronDown } from 'lucide-vue-next'
import { applicationState } from '@/app'
import Label from '@/shared/design/label.vue'
import { id, type ThreadsState } from '@/plugins/threads/state';

const actor: ThreadsState = applicationState.system.get(id);

// Keep actor reference for future use
// const someState = useSelector(actor, (state) => state.context.someState)

const title = ref('')
const type = ref('work-item')
// Placeholder options for title based on selected type
const workItemPlaceholders = [
  'Review latest PR for UX improvements',
  'Tackle sprint tasks for Q2',
  'Implement dev feedback for bug fixes'
]
const projectPlaceholders = [
  'Q3 marketing campaign',
  'Upcoming project milestones',
  'Settings page redesign',
]
const placeholder = ref('')
const setRandomPlaceholder = () => {
  const list = type.value === 'work-item'
    ? workItemPlaceholders
    : projectPlaceholders
  placeholder.value = list[Math.floor(Math.random() * list.length)]
}
onMounted(() => setRandomPlaceholder())
watch(type, () => setRandomPlaceholder())
const threads = ref<string[]>(['U-182', 'P-13', 'WI-7'])
const tags = ref<string[]>(['bug', 'frontend', 'high-priority'])
// const isSaving = ref('')
const isMessagesOpen = ref(false)
const isNotesOpen = ref(false)
const notes = ref('')

watch(isMessagesOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    const [messagesContainer, rootContainer] = [
      document.querySelector('.messages-container'),
      document.querySelector('.root-container')?.parentElement
    ]
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
    if (rootContainer) {
      rootContainer.scrollTop = rootContainer.scrollHeight
    }
  }
})

const addDetail = () => {
  threads.value.push('')
}

const removeThread = (index: number) => {
  threads.value.splice(index, 1)
}

const addTag = () => {
  tags.value.push('')
}

const removeTag = (index: number) => {
  tags.value.splice(index, 1)
}

// Mock message data
const messages = ref<{ text: string, sender: string }[]>([
  { text: 'This is a sample message that is quite long and should be truncated.', sender: 'user' },
  { text: 'Another message that will not fit in one line.', sender: 'other' },
  { text: 'Short message.', sender: 'user' },
  { text: 'Yet another example of a long message that needs truncation. Yet another example of a long message that need. Yet another example of a long message that need.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Yet another example of a long message that needs truncation.', sender: 'other' },
  { text: 'Final message to demonstrate overflow handling.', sender: 'user' }
]);
</script>

<style scoped>
.resize-handle {
  resize: vertical;
  overflow: auto;
}

.resize-handle::-webkit-resizer {
  border-width: .1rem;
  border-style: solid;
  border-color: transparent #3d3d3d #3d3d3d transparent;
  background-color: transparent;
}
</style>