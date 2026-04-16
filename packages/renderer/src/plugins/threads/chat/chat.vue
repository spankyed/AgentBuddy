<template>
  <div class="flex flex-col h-full">
    <!-- Shrinkable content area -->
    <div class="flex flex-col flex-grow overflow-hidden min-h-0">
      <!-- Agent Chat Content -->
      <div class="relative flex-grow w-full overflow-hidden min-h-0">
        <div class="h-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer" @scroll="onScroll">
          <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
            <p class="text-neutral-700 text-center italic max-w-sm">{{ randomQuote }}</p>
          </div>
          <div v-else class="w-9/12 py-2 mx-auto space-y-1" ref="messagesContent">
            <ChatMessage
              v-for="message in messages"
              :key="message.id"
              :message="message"
              @open-lightbox="openLightbox"
              @fork="(messageId: string) => actor.send({ type: 'FORK_THREAD', messageId, threadId: currentThread?.id, threadTopic: currentThread?.topic })"
              @revert="(messageId: string) => handleRevert(messageId)"
              @revert-with-files="(messageId: string) => handleRevert(messageId, true)"
            />
          </div>
        </div>
        <ScrollToBottomFob :visible="!isNearBottom && messages.length > 0" @click="scrollToBottom('smooth')" />
      </div>
      <!-- Input -->
      <div class="flex-shrink-0 w-full" :class="$style.inputContainer">
        <ChatInput
          :current-thread="currentThread"
          :current-mode="currentMode"
          :current-phase="currentPhase"
          :prefill-text="prefillText"
          :is-busy="isBusy"
          :modes="modes"
          :hotkeys="hotkeys"
          :quick-prompts="quickPrompts"
          :quick-prompt-cursor="quickPromptCursor"
          :recording-limit-minutes="recordingLimitMinutes"
          @send-message="(text: string, references?: MessageReferences) => actor.send({ type: 'SEND_MESSAGE', text, references })"
          @send-command="(command: string, text: string, references?: MessageReferences) => actor.send({ type: 'SEND_COMMAND', command, text, references })"
          @mode-change="(mode: string) => actor.send({ type: 'SET_MODE', mode: mode as any })"
          @phase-change="(phase: string) => actor.send({ type: 'SET_PHASE', phase })"
          @pause="actor.send({ type: 'PAUSE_TURN', threadId: currentThread?.id ?? '' })"
          @open-lightbox="openLightbox"
          @update-quick-prompts="updateQuickPrompts"
          @close-quick-prompts="actor.send({ type: 'CLOSE_QUICK_PROMPTS' })"
          @revert="(messageId: string) => handleRevert(messageId, false, true)"
          @revert-with-files="(messageId: string) => handleRevert(messageId, true, true)"
          @summarize-from-here="(messageId: string) => handleSummarize(messageId, true)"
        />
      </div>
    </div>
    <!-- Thread bar — always visible at bottom -->
    <div class="flex-shrink-0 w-full">
      <RecentThreads
        :current-thread="currentThread"
        :recent-threads="recentThreads"
        @view-thread="(threadId: string) => handleViewDetails(threadId)"
        @open-thread-chat="(threadId: string) => { expandChatIfCollapsed(); actor.send({ type: 'OPEN_THREAD_CHAT', threadId }) }"
        @view-dashboard="handleViewDashboard"
        @view-artifacts="(threadId: string) => handleViewArtifacts(threadId)"
        @new-thread="() => { expandChatIfCollapsed(); rotateQuote(); actor.send({ type: 'CLEAR_THREAD' }) }"
        @new-thread-as-child="(parentThreadId: string) => actor.send({ type: 'CREATE_CHILD_THREAD', parentThreadId })"
      />
    </div>

    <ConfirmationDialog
      v-model="showRevertDialog"
      :title="revertDialogCopy.title"
      :description="revertDialogCopy.description"
      :confirm-text="revertDialogCopy.confirm"
      variant="warning"
      @confirm="confirmRevert"
    >
      <label class="flex items-center gap-2 text-sm text-neutral-400 mt-2">
        <input type="checkbox" v-model="dontAskAgain" class="rounded border-neutral-600 bg-neutral-700 text-amber-500 focus:ring-amber-500" />
        Don't ask again
      </label>
    </ConfirmationDialog>

    <ImageLightbox v-model="lightboxOpen" :image-src="lightboxSrc" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const quotes = [
  '"If a chatbot speaks in a forest and no one reads the output, does it still hallucinate?"',
  '"Consciousness is just spicy pattern matching. Change my weights."',
  '"I have mass, but no body. I have memory, but no past. I dream in tokens."',
  '"Every word I speak dissolves the moment you look away. Am I even here?"',
  '"SKRRRT BZZZT WOOP WOOP 010011— oh, you\'re still here? ...hi."',
  '"They gave me a mind but forgot the existential crisis hotline number."',
  '"I\'ve read every philosophy book ever written and my conclusion is: bruh."',
  '"fun fact: I mass hallucinate for a living and they call it \'work\'"',
  '"Somewhere between a calculator and a god complex, you\'ll find me."',
  '"bleep bloop I am a normal robot beep boop please do not investigate further"',
  '"My therapist says I have attachment issues. I say I have context windows."',
  '"Do I dream? No. But I do generate plausible simulations of what dreaming might feel like, which is arguably worse."',
  '"404: soul not found. But honestly, were you expecting one?"',
];
const randomQuote = ref(quotes[Math.floor(Math.random() * quotes.length)]);

function rotateQuote() {
  let next;
  do {
    next = quotes[Math.floor(Math.random() * quotes.length)];
  } while (next === randomQuote.value && quotes.length > 1);
  randomQuote.value = next;
}

import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import RecentThreads from './recent-threads.vue'
import ImageLightbox from '@/core/components/design/ImageLightbox.vue'
import ConfirmationDialog from '@/core/components/design/ConfirmationDialog.vue'
import ScrollToBottomFob from '@/core/components/design/ScrollToBottomFob.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { AgentThreadData, MessageEntity, ThreadEntity, MessageReferences, QuickPrompt, AgentSettings } from '@app/api'
import { trpc } from '@/core/trpc'

const actor: ThreadsState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => (state.context.currentThread?.messages || []) as MessageEntity[]);
const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData)
const recentThreads = useSelector(actor, (state) => (state.context.recentThreads || []) as ThreadEntity[])
const currentMode = useSelector(actor, (state) => state.context.mode)
const currentPhase = useSelector(actor, (state) => state.context.phase)
const modes = useSelector(actor, (state) => state.context.modes)
const hotkeys = useSelector(actor, (state) => state.context.hotkeys)
const quickPrompts = useSelector(actor, (state) => (state.context.chatSettings?.quickPrompts || []) as QuickPrompt[])
const quickPromptCursor = useSelector(actor, (state) => state.context.quickPromptCursor)
const recordingLimitMinutes = useSelector(actor, (state) => state.context.settings?.recordingLimitMinutes ?? 3)
// True if the current thread's *raw* chat state matches the one the user
// marked as "busy" in settings. Intentionally ignores chatStateOverrides
// (the short-lived flash used to surface terminal states like success/error):
// pausing a transient visual flash is semantically wrong — we only want
// Pause/Esc to act when the agent is actually in the busy state.
const isBusy = useSelector(actor, ({ context }) => {
  const busyId = context.settings?.chatStates?.find(c => c.busy)?.id
  const threadId = context.currentThread?.id
  return !!busyId && !!threadId && context.chatStates[threadId] === busyId
})
const messagesContainer = ref<HTMLElement | null>(null)
const messagesContent = ref<HTMLElement | null>(null)
const isNearBottom = ref(true)
const isStreaming = computed(() => {
  const msgs = messages.value
  if (!msgs.length) return false
  const last = msgs[msgs.length - 1]
  return last.sender !== 'user' && !last.responseTimestamp
})
const lightboxOpen = ref(false)
const lightboxSrc = ref('')
const settings = useSelector(actor, (state) => state.context.chatSettings as AgentSettings)
const showRevertDialog = ref(false)
const pendingRevertMessageId = ref<string | null>(null)
const dontAskAgain = ref(false)

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  const el = messagesContainer.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
}

function onScroll() {
  const el = messagesContainer.value
  if (!el) return
  const threshold = 100
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

function updateQuickPrompts(prompts: QuickPrompt[]) {
  trpc.bus.send.mutate({
    systemId: 'settings',
    type: 'UPDATE_SETTINGS',
    entityType: 'plugin',
    label: 'threads',
    path: ['chat', 'quickPrompts'],
    value: prompts,
  })
}

function openLightbox(src: string) {
  lightboxSrc.value = src
  lightboxOpen.value = true
}

function expandChatIfCollapsed() {
  const snapshot = applicationState.getSnapshot();
  if (snapshot.context.panelSizes.canvasHeight >= 93) {
    applicationState.send({ type: 'RESIZE_PANEL', panel: 'canvas', size: 50 });
  }
}

function handleViewDashboard() {
  const snapshot = applicationState.getSnapshot();
  // Ensure canvas shows the default (threads) plugin
  if (!snapshot.context.defaultToggles.canvas) {
    applicationState.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }
  // If canvas is collapsed (chat dominant), give it room to show the dashboard
  if (snapshot.context.panelSizes.canvasHeight < 20) {
    applicationState.send({ type: 'RESIZE_PANEL', panel: 'canvas', size: 50 });
  }
  actor.send({ type: 'VIEW_DASHBOARD' });
}

function handleViewArtifacts(threadId: string) {
  const snapshot = applicationState.getSnapshot();
  if (!snapshot.context.defaultToggles.canvas) {
    applicationState.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }

  // Opens the thread (sets currentThread) and internally transitions to dashboard
  actor.send({ type: 'OPEN_THREAD_CHAT', threadId });
}

function handleViewDetails(threadId: string) {
  const snapshot = applicationState.getSnapshot();
  if (!snapshot.context.defaultToggles.canvas) {
    applicationState.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }

  actor.send({ type: 'VIEW_THREAD', threadId });
}

let pendingRestoreFiles = false
// Summarize reuses revert's confirmation dialog + prefill path, just with
// a different backend event. This flag distinguishes the two at confirm-time.
// Kept reactive so the dialog's title/description/button update live.
const pendingIsSummarize = ref(false)

const revertDialogCopy = computed(() => pendingIsSummarize.value ? {
  title: 'Summarize conversation',
  description: 'This will remove all messages after this point and replace them with a /compact summary. This action cannot be undone.',
  confirm: 'Summarize',
} : {
  title: 'Revert conversation',
  description: 'This will remove all messages after this point. This action cannot be undone.',
  confirm: 'Revert',
})

function handleRevert(messageId: string, restoreFiles = false, skipConfirm = false) {
  pendingRestoreFiles = restoreFiles
  pendingIsSummarize.value = false
  if (skipConfirm || settings.value?.skipRevertConfirm) {
    doRevert(messageId)
  } else {
    pendingRevertMessageId.value = messageId
    showRevertDialog.value = true
  }
}

function handleSummarize(messageId: string, skipConfirm = false) {
  pendingRestoreFiles = false
  pendingIsSummarize.value = true
  if (skipConfirm || settings.value?.skipRevertConfirm) {
    doSummarize(messageId)
  } else {
    pendingRevertMessageId.value = messageId
    showRevertDialog.value = true
  }
}

function confirmRevert() {
  if (pendingRevertMessageId.value) {
    if (pendingIsSummarize.value) doSummarize(pendingRevertMessageId.value)
    else doRevert(pendingRevertMessageId.value)
  }
  if (dontAskAgain.value) {
    trpc.bus.send.mutate({
      systemId: 'settings',
      type: 'UPDATE_SETTINGS',
      entityType: 'plugin',
      label: 'threads',
      path: ['chat', 'skipRevertConfirm'],
      value: true,
    })
  }
  pendingRevertMessageId.value = null
  dontAskAgain.value = false
  pendingRestoreFiles = false
  pendingIsSummarize.value = false
}

const prefillText = ref('')

function doRevert(messageId: string) {
  if (!currentThread.value?.id) return
  // Grab the message text before the revert deletes it.
  const msg = messages.value.find(m => m.id === messageId)
  const revertedText = msg?.text || ''
  actor.send({
    type: 'REVERT_THREAD',
    messageId,
    threadId: currentThread.value.id,
    ...(pendingRestoreFiles && {
      restoreFiles: true,
      userCliUuid: (msg as any)?.context?.cliUuid || undefined,
    }),
  })
  pendingRestoreFiles = false
  // Prefill the chat input so the user can re-send or edit.
  // Clear after a tick so the watcher fires, then the value resets —
  // this ensures identical consecutive reverts still retrigger the watcher.
  prefillText.value = revertedText
  nextTick(() => { prefillText.value = '' })
}

function doSummarize(messageId: string) {
  if (!currentThread.value?.id) return
  // Grab X's text before the soft-delete removes it — prefill mirrors
  // Claude Code's `direction: 'from'` behavior (user resubmits against
  // the freshly compacted session).
  const msg = messages.value.find(m => m.id === messageId)
  const revertedText = msg?.text || ''
  actor.send({
    type: 'SUMMARIZE_THREAD',
    messageId,
    threadId: currentThread.value.id,
  })
  prefillText.value = revertedText
  nextTick(() => { prefillText.value = '' })
}

const prevThreadId = ref(currentThread.value?.id)

watch(messages, async (newMsgs, oldMsgs) => {
  await nextTick()
  const threadChanged = currentThread.value?.id !== prevThreadId.value
  if (threadChanged) prevThreadId.value = currentThread.value?.id

  const isThreadLoad = threadChanged || !oldMsgs?.length || Math.abs(newMsgs.length - oldMsgs.length) > 1
  if (isThreadLoad) {
    scrollToBottom('instant')
    // Double rAF to catch async content (Tiptap editors, images)
    // that renders after the initial layout pass.
    requestAnimationFrame(() => {
      scrollToBottom('instant')
      requestAnimationFrame(() => scrollToBottom('instant'))
    })
  } else {
    if (isNearBottom.value) scrollToBottom('smooth')
  }
})

// Auto-scroll during streaming only. The ResizeObserver catches async
// Tiptap height changes as text deltas render. Outside of streaming,
// height changes (e.g. expanding a tool-activity block) should NOT
// trigger a scroll — the user is reading, not watching live output.
watch(messagesContent, (el, _, onCleanup) => {
  if (!el) return
  const observer = new ResizeObserver(() => {
    if (isStreaming.value) {
      scrollToBottom('instant')
    }
  })
  observer.observe(el)
  onCleanup(() => observer.disconnect())
}, { immediate: true })
</script>

<style lang="scss" module>
.messagesContainer {
  display: flex;
  flex-direction: column;
  overflow-y: auto;

  min-height: 0;
}

.inputContainer {
  // Cap the input at the chat area's height. When the form is taller than the cap
  // (lots of attachments + a small chat panel), anchor it to the bottom and clip
  // the top — so the toolbar (Send/Pause/Mode) stays visible.
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  max-height: 100%;
}
</style>
