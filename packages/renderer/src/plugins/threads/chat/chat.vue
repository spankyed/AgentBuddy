<template>
  <div class="flex flex-col h-full">
    <!-- Main content: optional inline dashboard + chat -->
    <div class="flex flex-grow overflow-hidden min-h-0" ref="chatContainerRef">
      <!-- Inline Dashboard (left) -->
      <div v-if="showInlineDashboard" class="min-w-0 overflow-hidden shrink-0 border-r border-neutral-800" :style="{ width: dashboardWidth + '%' }">
        <AgentCanvas :inline="true" />
      </div>
      <PanelResizer
        v-if="showInlineDashboard"
        orientation="horizontal"
        @resize="handleDashboardResize"
      />
      <!-- Chat column (right, or full width when dashboard hidden) -->
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden" :class="{ 'pt-2': !showInlineTabs }" style="background-color: rgb(28 28 28)">
        <!-- Inline Tab Bar -->
        <InlineTabBar :visible="showInlineTabs" @close="showInlineTabs = false" />
        <!-- Shrinkable content area -->
        <div class="flex flex-col flex-grow overflow-hidden min-h-0">
          <!-- Agent Chat Content -->
          <div class="relative flex-grow w-full overflow-hidden min-h-0" :class="$style.messagesWrapper">
            <div class="h-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer" @scroll="onScroll">
              <div v-if="allMessages.length === 0 && !currentThread?.instructions" class="flex items-center justify-center h-full">
                <p class="text-neutral-700 text-center italic max-w-sm">{{ randomQuote }}</p>
              </div>
              <div v-else class="w-9/12 py-2 mx-auto space-y-1" ref="messagesContent">
                <!-- Instructions banner -->
                <div v-if="currentThread?.instructions" class="mb-3 rounded-lg border border-neutral-700/50 bg-neutral-800/50 px-4 py-3">
                  <div class="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">Instructions</div>
                  <div class="text-neutral-300 text-sm leading-relaxed" v-html="currentThread.instructions"></div>
                </div>
                <ChatMessage
                  v-for="message in visibleMessages"
                  :key="message.id"
                  :message="message"
                  :is-tail="isTailMessage(message)"
                  :is-claude-code-thread="!!currentThread?.context?.claudeCode"
                  @open-lightbox="openLightbox"
                  @fork="(messageId: string) => actor.send({ type: 'FORK_THREAD', messageId, threadId: currentThread?.id, threadTopic: currentThread?.topic })"
                  @unqueue="handleUnqueue"
                  @resend="handleResend"
                  @revert="(messageId: string) => handleRevert(messageId)"
                  @revert-with-files="(messageId: string) => handleRevert(messageId, true)"
                  @toggle-compacted="handleToggleCompacted"
                />
              </div>
            </div>
            <ScrollToBottomFob :visible="!isNearBottom && allMessages.length > 0" @click="scrollToBottom('smooth')" />
          </div>
          <!-- Input -->
          <div class="flex-shrink-0 w-full" :class="$style.inputContainer">
            <ChatInput
              :current-thread="currentThread"
              :current-mode="currentMode"
              :current-phase="currentPhase"
              :prefill-text="prefillText"
              :prefill-references="prefillReferences"
              :is-busy="isBusy"
              :modes="modes"
              :hotkeys="hotkeys"
              :quick-prompts="quickPrompts"
              :quick-prompt-number-key-inserts="quickPromptNumberKeyInserts"
              :quick-prompt-cursor="quickPromptCursor"
              :recording-limit-minutes="recordingLimitMinutes"
              :status-line="statusLine"
              :status-line-cwd="statusLineCwd"
              @send-message="handleSendMessage"
              @send-command="handleSendCommand"
              @mode-change="(mode: string) => actor.send({ type: 'SET_MODE', mode: mode as any })"
              @phase-change="(phase: string) => actor.send({ type: 'SET_PHASE', phase })"
              @pause="actor.send({ type: 'PAUSE_TURN', threadId: currentThread?.id ?? '' })"
              @open-lightbox="openLightbox"
              @update-quick-prompts="updateQuickPrompts"
              @close-quick-prompts="actor.send({ type: 'CLOSE_QUICK_PROMPTS' })"
              @revert="(messageId: string) => handleRevert(messageId, false, true)"
              @revert-with-files="(messageId: string) => handleRevert(messageId, true, true)"
              @summarize-from-here="(messageId: string) => handleSummarize(messageId, true)"
              @statusline-click="handleStatuslineClick"
            />
          </div>
        </div>
        <!-- Thread bar — stays within chat column -->
        <div class="flex-shrink-0 w-full">
          <RecentThreads
            :current-thread="currentThread"
            :recent-threads="recentThreads"
            @view-thread="(threadId: string) => handleViewDetails(threadId)"
            @open-thread-chat="(threadId: string) => { expandChatIfCollapsed(); actor.send({ type: 'OPEN_THREAD_CHAT', threadId }) }"
            @view-dashboard="handleViewDashboard"
            @toggle-inline-dashboard="handleToggleInlineDashboard"
            @toggle-inline-tabs="handleToggleInlineTabs"
            @view-artifacts="(threadId: string) => handleViewArtifacts(threadId)"
            @new-thread="() => { expandChatIfCollapsed(); rotateQuote(); actor.send({ type: 'CLEAR_THREAD' }) }"
            @new-thread-in-project="(dir: string) => { expandChatIfCollapsed(); rotateQuote(); actor.send({ type: 'NEW_THREAD_IN_PROJECT', directory: dir }) }"
            @new-thread-no-project="() => { expandChatIfCollapsed(); rotateQuote(); actor.send({ type: 'NEW_THREAD_NO_PROJECT' }) }"
            @new-thread-as-child="(parentThreadId: string) => actor.send({ type: 'CREATE_CHILD_THREAD', parentThreadId })"
          />
        </div>
      </div>
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
import InlineTabBar from './inline-tab-bar.vue'
import AgentCanvas from '@/plugins/threads/canvas/agent/canvas.vue'
import PanelResizer from '@/core/components/layout/panel-resizer.vue'
import ImageLightbox from '@/core/components/design/ImageLightbox.vue'
import ConfirmationDialog from '@/core/components/design/ConfirmationDialog.vue'
import ScrollToBottomFob from '@/core/components/design/ScrollToBottomFob.vue'
import { applicationState } from '@/main'
import { navigateToPlugin } from '@/core/utils/navigate'
import { useSelector } from '@xstate/vue'
import { id, threadsFromStore, type ThreadsState } from '@/plugins/threads/state';
import type { AgentThreadData, MessageEntity, ThreadEntity, MessageReferences, QuickPrompt, AgentSettings } from '@app/api'
import { trpc } from '@/core/trpc'

const actor: ThreadsState = applicationState.system.get(id);
const allMessages = useSelector(actor, (state) => (state.context.currentThread?.messages || []) as MessageEntity[]);
const visibleMessages = computed(() => allMessages.value.filter(m => !(m as any).compacted));

/** True when no processed user messages follow this one — gates queued/cancelled actions. */
function isTailMessage(msg: MessageEntity): boolean {
  const msgs = visibleMessages.value
  const idx = msgs.indexOf(msg)
  if (idx === -1) return false
  return !msgs.slice(idx + 1).some(m => m.sender === 'user' && !m.status)
}

const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData)
const recentThreadIds = useSelector(actor, (state) => state.context.recentThreadIds)
const threadMap = useSelector(actor, (state) => state.context.threadMap)
const recentThreads = computed(() => threadsFromStore(threadMap.value, recentThreadIds.value) as ThreadEntity[])
const currentMode = useSelector(actor, (state) => state.context.mode)
const currentPhase = useSelector(actor, (state) => state.context.phase)
const modes = useSelector(actor, (state) => state.context.modes)
const hotkeys = useSelector(actor, (state) => state.context.hotkeys)
const quickPrompts = useSelector(actor, (state) => (state.context.chatSettings?.quickPrompts || []) as QuickPrompt[])
const quickPromptNumberKeyInserts = useSelector(actor, (state) => state.context.chatSettings?.quickPromptNumberKeyInserts ?? true)
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
const statusLineCwd = computed(() => {
  return currentThread.value?.context?.claudeCode?.cwd
})
const statusLine = computed(() => {
  const cwd = statusLineCwd.value
  if (!cwd) return undefined
  const segments = cwd.split('/').filter(Boolean)
  if (segments.length <= 3) return cwd
  return `…/${segments.slice(-3).join('/')}`
})

const showInlineDashboard = ref(false)
const showInlineTabs = ref(false)
const chatContainerRef = ref<HTMLElement | null>(null)
const dashboardWidth = ref(45)

const MIN_PANEL_WIDTH = 400

function handleDashboardResize(delta: number) {
  const container = chatContainerRef.value
  if (!container) return
  const containerWidth = container.clientWidth
  const deltaPercent = (delta / containerWidth) * 100
  const newPercent = dashboardWidth.value + deltaPercent
  const newPx = (newPercent / 100) * containerWidth
  const chatPx = containerWidth - newPx
  if (newPx < MIN_PANEL_WIDTH || chatPx < MIN_PANEL_WIDTH) return
  dashboardWidth.value = newPercent
}

const canvasHeight = useSelector(applicationState, (state) => state.context.panelSizes.canvasHeight)

watch(canvasHeight, (height) => {
  if (height >= 93) showInlineDashboard.value = false
})
const messagesContainer = ref<HTMLElement | null>(null)
const messagesContent = ref<HTMLElement | null>(null)
const isNearBottom = ref(true)
const pendingScrollOnSend = ref(false)
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

/** Instant scroll + double rAF to catch async content (Tiptap, images). */
function forceScrollToBottom() {
  scrollToBottom('instant')
  requestAnimationFrame(() => {
    scrollToBottom('instant')
    requestAnimationFrame(() => scrollToBottom('instant'))
  })
}

function handleStatuslineClick() {
  const cwd = statusLineCwd.value
  if (!cwd) return
  navigateToPlugin('code')
  applicationState.system.get('explorer')?.send({ type: 'explorer.SET_BASE_DIRECTORY', path: cwd })
}

function handleSendMessage(text: string, references?: MessageReferences) {
  actor.send({ type: 'SEND_MESSAGE', text, references })
  pendingScrollOnSend.value = true
}

function handleUnqueue(messageId: string) {
  if (currentThread.value?.id) {
    actor.send({ type: 'UNQUEUE_MESSAGE', threadId: currentThread.value.id, messageId })
  }
}

function handleResend(messageId: string, text: string, references?: any) {
  actor.send({ type: 'DISMISS_MESSAGE', messageId })
  handleSendMessage(text, references)
}

function handleSendCommand(command: string, text: string, references?: MessageReferences) {
  actor.send({ type: 'SEND_COMMAND', command, text, references })
  pendingScrollOnSend.value = true
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

function handleToggleInlineTabs() {
  showInlineTabs.value = !showInlineTabs.value
}

function handleToggleInlineDashboard() {
  if (!showInlineDashboard.value) expandChatIfCollapsed()
  showInlineDashboard.value = !showInlineDashboard.value
}

function handleViewDashboard() {
  navigateToPlugin('threads', { type: 'VIEW_DASHBOARD' });
  // If canvas is collapsed (chat dominant), give it room to show the dashboard
  if (applicationState.getSnapshot().context.panelSizes.canvasHeight < 20) {
    applicationState.send({ type: 'RESIZE_PANEL', panel: 'canvas', size: 50 });
  }
}

function handleViewArtifacts(threadId: string) {
  navigateToPlugin('threads', { type: 'OPEN_THREAD_CHAT', threadId });
}

function handleViewDetails(threadId: string) {
  navigateToPlugin('threads', { type: 'VIEW_THREAD', threadId });
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
  // Queued/cancelled: lightweight dismiss — prefill input, remove from UI, no backend revert.
  const msg = allMessages.value.find(m => m.id === messageId)
  if (msg?.status === 'queued' || msg?.status === 'cancelled') {
    prefillInput(msg)
    if (msg.status === 'queued' && currentThread.value?.id) {
      actor.send({ type: 'UNQUEUE_MESSAGE', threadId: currentThread.value.id, messageId })
    }
    actor.send({ type: 'DISMISS_MESSAGE', messageId })
    return
  }

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
const prefillReferences = ref<MessageReferences | undefined>()

function prefillInput(msg: MessageEntity | undefined) {
  const text = msg?.text || ''
  const refs = msg?.references as MessageReferences | undefined
  prefillText.value = text
  if (refs?.images?.length || refs?.files?.length) {
    prefillReferences.value = refs
  }
  nextTick(() => {
    prefillText.value = ''
    prefillReferences.value = undefined
  })
}

function doRevert(messageId: string) {
  if (!currentThread.value?.id) return
  const msg = allMessages.value.find(m => m.id === messageId)
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
  prefillInput(msg)
}

function doSummarize(messageId: string) {
  if (!currentThread.value?.id) return
  const msg = allMessages.value.find(m => m.id === messageId)
  actor.send({
    type: 'SUMMARIZE_THREAD',
    messageId,
    threadId: currentThread.value.id,
  })
  prefillInput(msg)
}

function handleToggleCompacted(markerId: string, compacted: boolean) {
  trpc.bus.send.mutate({
    systemId: 'threads',
    type: 'TOGGLE_COMPACTED',
    markerId,
    compacted,
  })
}

const prevThreadId = ref(currentThread.value?.id)

watch(allMessages, async (newMsgs, oldMsgs) => {
  await nextTick()
  const threadChanged = currentThread.value?.id !== prevThreadId.value
  if (threadChanged) {
    prevThreadId.value = currentThread.value?.id
    showInlineDashboard.value = false
  }

  const isThreadLoad = threadChanged || !oldMsgs?.length || Math.abs(newMsgs.length - oldMsgs.length) > 1
  if (isThreadLoad || pendingScrollOnSend.value) {
    pendingScrollOnSend.value = false
    forceScrollToBottom()
  } else if (isNearBottom.value) {
    scrollToBottom('smooth')
    requestAnimationFrame(() => {
      if (isNearBottom.value) scrollToBottom('instant')
    })
  }
})

// Auto-scroll while the agent is busy and the user hasn't scrolled away.
// The ResizeObserver catches async Tiptap height changes as text deltas
// render. Outside of busy state (or when the user scrolled up), height
// changes (e.g. expanding a tool-activity block) should NOT trigger a
// scroll — the user is reading, not watching live output.
watch(messagesContent, (el, _, onCleanup) => {
  if (!el) return
  const observer = new ResizeObserver(() => {
    if (isBusy.value && isNearBottom.value) {
      scrollToBottom('instant')
    }
  })
  observer.observe(el)
  onCleanup(() => observer.disconnect())
}, { immediate: true })
</script>

<style lang="scss" module>
.messagesWrapper {
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 15px;
    height: 40px;
    background: linear-gradient(to bottom, transparent, rgb(28 28 28));
    pointer-events: none;
    z-index: 5;
  }
}

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
