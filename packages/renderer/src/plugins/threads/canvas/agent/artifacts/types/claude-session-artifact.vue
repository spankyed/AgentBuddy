<template>
  <div class="max-w-2xl">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <Wrench :size="14" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200 flex-1">Claude Code session</h3>
        <button
          v-if="content.sessionId"
          @click="copyResumeCommand"
          class="text-neutral-500 hover:text-neutral-300 transition-colors p-1"
          :title="resumeCopied ? 'Copied!' : 'Copy resume command'"
        >
          <Check v-if="resumeCopied" :size="12" class="text-green-500" />
          <Terminal v-else :size="12" />
        </button>
        <span class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            :class="stateConfig?.busy ? 'animate-pulse' : ''"
            :style="{ backgroundColor: stateConfig?.color ?? '#6B7280' }"
            :title="content.chatState"
          />
          <span class="text-xs text-neutral-400 capitalize">{{ stateConfig?.label ?? content.chatState }}</span>
        </span>
      </div>

      <!-- Session error banner -->
      <div
        v-if="content.sessionError"
        class="px-3 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-300"
      >
        {{ content.sessionError }}
      </div>

      <!-- Key/value grid -->
      <div class="px-3 py-3 space-y-2 text-xs">
        <div class="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2">
          <span class="text-neutral-500">Model</span>
          <span class="text-neutral-200 font-mono truncate">{{ content.model || '—' }}</span>

          <span class="text-neutral-500">Session</span>
          <div class="flex items-center gap-2">
            <span class="text-neutral-200 font-mono truncate flex-1">
              {{ truncatedSessionId || '—' }}
            </span>
            <button
              v-if="content.sessionId"
              @click="copySessionId"
              class="text-neutral-500 hover:text-neutral-300 transition-colors"
              :title="copied ? 'Copied!' : 'Copy session id'"
            >
              <Check v-if="copied" :size="12" class="text-green-500" />
              <Copy v-else :size="12" />
            </button>
          </div>

          <span class="text-neutral-500">CWD</span>
          <span class="text-neutral-200 font-mono truncate" :title="content.cwd">
            {{ shortenCwd(content.cwd) || '—' }}
          </span>

          <span class="text-neutral-500">Turns</span>
          <span class="text-neutral-200 tabular-nums">{{ content.turns ?? 0 }}</span>

          <span class="text-neutral-500">Tools</span>
          <span class="text-neutral-200 tabular-nums">{{ content.toolCallCount ?? 0 }}</span>

          <span class="text-neutral-500">Cost</span>
          <span class="text-neutral-200 tabular-nums">${{ (content.totalCostUsd ?? 0).toFixed(3) }}</span>
        </div>

        <!-- Recent tools (last 3, collapsible) -->
        <details v-if="recentTools.length" class="pt-2 mt-2 border-t border-neutral-800 text-neutral-500">
          <summary class="text-[10px] uppercase tracking-wide cursor-pointer select-none hover:text-neutral-400">Recent</summary>
          <div
            v-for="(tool, i) in recentTools"
            :key="i"
            class="text-neutral-300 truncate mt-0.5"
          >
            <span class="font-mono text-xs">{{ tool.name }}</span>
            <span v-if="tool.summary" class="text-neutral-500 text-xs"> · {{ tool.summary }}</span>
            <span class="text-neutral-600 text-[10px]"> · {{ relativeTime(tool.at) }}</span>
          </div>
        </details>

        <!-- Permission mode — segmented control. Takes effect on next turn. -->
        <div class="pt-2 mt-2 border-t border-neutral-800">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] uppercase tracking-wide text-neutral-500">Permission</span>
            <span class="text-[10px] text-neutral-600">{{ permissionDescription }}</span>
          </div>
          <div class="flex rounded-md border border-neutral-700 overflow-hidden">
            <button
              v-for="opt in permissionOptions"
              :key="opt.value"
              type="button"
              @click="selectPermissionMode(opt.value)"
              :title="opt.tooltip"
              :class="[
                'flex-1 px-2 py-1 text-xs font-medium transition-colors border-r border-neutral-700 last:border-r-0',
                permissionMode === opt.value
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'bg-neutral-900/40 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Worktree toggle -->
        <div class="pt-2 mt-2 border-t border-neutral-800">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] uppercase tracking-wide text-neutral-500">Worktree</span>
            <span class="text-[10px] text-neutral-600">{{ useWorktree ? 'Isolated file mutations' : 'Direct edits' }}</span>
          </div>
          <div class="flex rounded-md border border-neutral-700 overflow-hidden">
            <button
              v-for="opt in [{ value: false, label: 'Off' }, { value: true, label: 'On' }]"
              :key="String(opt.value)"
              type="button"
              @click="selectWorktree(opt.value)"
              :title="opt.value ? 'Run in a git worktree (isolated)' : 'Edit files directly'"
              :class="[
                'flex-1 px-2 py-1 text-xs font-medium transition-colors border-r border-neutral-700 last:border-r-0',
                useWorktree === opt.value
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'bg-neutral-900/40 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { Wrench, Copy, Check, Terminal } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import { applicationState } from '@/main'
import { id as threadsId } from '@/plugins/threads/state'

type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto'

interface SessionContent {
  sessionId: string
  model: string
  cwd: string
  startedAt: number
  lastTurnAt: number
  turns: number
  totalCostUsd: number
  chatState: 'idle' | 'working' | 'paused' | 'error'
  toolCallCount: number
  lastTool?: { name: string; summary: string; at: number }
  permissionMode?: PermissionMode
  sessionError?: string
}

const props = defineProps<{
  artifact: ArtifactItem & { content: SessionContent }
}>()

const content = computed(() => props.artifact.content)
const threadsActor = applicationState.system.get(threadsId)
const currentThreadId = useSelector(
  threadsActor,
  (state: any) => state.context.currentThread?.id as string | undefined,
)

// Backward compat: fall back to legacy lastTool if recentTools isn't populated yet.
const recentTools = computed(() =>
  content.value?.recentTools ?? (content.value?.lastTool ? [content.value.lastTool] : [])
)

const settings = useSelector(threadsActor, (state: any) => state.context.settings);
const overrides = useSelector(threadsActor, (state: any) => state.context.chatStateOverrides);
const stateConfig = computed(() => {
  const configs = settings.value?.chatStates;
  const threadId = currentThreadId.value ?? '';
  const override = overrides.value?.[threadId];
  const activeId = (override && override.expiresAt > Date.now()) ? override.id : content.value.chatState;
  return configs?.find((c: any) => c.id === activeId);
});

const truncatedSessionId = computed(() => {
  const id = content.value.sessionId
  if (!id) return ''
  if (id.length <= 18) return id
  return `${id.slice(0, 8)}…${id.slice(-6)}`
})

function shortenCwd(cwd: string): string {
  if (!cwd) return ''
  // Show at most the last 3 path segments so the card stays compact.
  const segments = cwd.split('/').filter(Boolean)
  if (segments.length <= 3) return cwd
  return `…/${segments.slice(-3).join('/')}`
}

function relativeTime(epochMs: number): string {
  const delta = Date.now() - epochMs
  if (delta < 5_000) return 'just now'
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`
  return `${Math.round(delta / 3_600_000)}h ago`
}

const copied = ref(false)
async function copySessionId() {
  try {
    await navigator.clipboard.writeText(content.value.sessionId)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* clipboard denied */ }
}

const resumeCopied = ref(false)
async function copyResumeCommand() {
  try {
    await navigator.clipboard.writeText(`claude --resume ${content.value.sessionId}`)
    resumeCopied.value = true
    setTimeout(() => { resumeCopied.value = false }, 1500)
  } catch { /* clipboard denied */ }
}

// ─── Permission mode segmented control ─────────────────────────────────
// The three modes surfaced in the UI (other PermissionMode variants exist
// but aren't useful for interactive work-mode chats). Takes effect on the
// NEXT turn — chat.ts reads content.permissionMode at action entry.
const permissionOptions: Array<{
  value: PermissionMode
  label: string
  tooltip: string
  description: string
}> = [
  {
    value: 'default',
    label: 'Ask',
    tooltip: 'Approve every edit (safe default)',
    description: 'Approves each edit individually',
  },
  {
    value: 'acceptEdits',
    label: 'Auto',
    tooltip: 'Auto-accept file edits; still prompt for Bash',
    description: 'Auto-accepts file edits',
  },
]

const permissionMode = computed<PermissionMode>(
  () => content.value?.permissionMode ?? 'default',
)

const permissionDescription = computed(
  () => permissionOptions.find(o => o.value === permissionMode.value)?.description ?? '',
)

function selectPermissionMode(mode: PermissionMode) {
  if (mode === permissionMode.value) return
  const threadId = currentThreadId.value
  if (!threadId) {
    console.warn('[claude-session-artifact] no current thread; cannot update permission mode')
    return
  }
  threadsActor.send({
    type: 'UPDATE_CLAUDE_PERMISSION_MODE',
    threadId,
    mode,
  })
}

const useWorktree = computed(() => content.value?.useWorktree ?? false)

function selectWorktree(value: boolean) {
  if (value === useWorktree.value) return
  const threadId = currentThreadId.value
  if (!threadId) return
  threadsActor.send({
    type: 'UPDATE_CLAUDE_WORKTREE',
    threadId,
    useWorktree: value,
  } as any)
}
</script>
