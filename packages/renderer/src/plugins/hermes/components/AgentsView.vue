<template>
  <div class="p-8">
    <h2 class="text-lg font-medium text-neutral-100 mb-4">Agents</h2>

    <div class="space-y-4">
      <!-- Connection Info -->
      <div class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <h3 class="text-sm font-medium text-neutral-200 mb-2">Hermes Agent</h3>
        <div class="space-y-2 text-sm text-neutral-400">
          <div class="flex items-center gap-2">
            <span class="text-neutral-500">Status:</span>
            <span :class="connectionStatus === 'connected' ? 'text-green-400' : 'text-neutral-500'">
              {{ connectionStatus }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-neutral-500">Installed:</span>
            <span :class="installStatus === 'installed' ? 'text-green-400' : installStatus === 'installing' ? 'text-yellow-400' : 'text-neutral-500'">
              {{ installStatus === 'installed' ? `v${version || 'unknown'}` : installStatus }}
            </span>
          </div>
        </div>
      </div>

      <!-- Models -->
      <div v-if="models.length > 0" class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <h3 class="text-sm font-medium text-neutral-200 mb-2">Available Models</h3>
        <div class="space-y-1">
          <div
            v-for="model in models"
            :key="model.name"
            class="flex items-center justify-between py-1 text-sm"
          >
            <span class="text-neutral-300">{{ model.name }}</span>
            <span class="text-xs text-neutral-500">{{ model.provider }}</span>
          </div>
        </div>
      </div>

      <!-- Sessions -->
      <div class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-medium text-neutral-200">Recent Sessions</h3>
          <button
            @click="emit('refreshSessions')"
            class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Refresh
          </button>
        </div>
        <div v-if="sessions.length > 0" class="space-y-1 max-h-64 overflow-auto">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="flex items-center justify-between py-2 px-2 rounded hover:bg-neutral-700/50 transition-colors cursor-pointer"
            @click="emit('resumeSession', session.id)"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm text-neutral-300 truncate">{{ session.title }}</div>
              <div class="text-xs text-neutral-500 flex gap-3">
                <span>{{ session.model || 'no model' }}</span>
                <span>{{ session.message_count }} msgs</span>
                <span>{{ formatTime(session.updated_at) }}</span>
              </div>
            </div>
            <span class="text-xs text-neutral-600 font-mono ml-2">{{ session.id.slice(0, 8) }}</span>
          </div>
        </div>
        <div v-else class="text-xs text-neutral-500 py-2">
          {{ connectionStatus === 'connected' ? 'No sessions found.' : 'Connect to see sessions.' }}
        </div>
      </div>

      <!-- Workspaces -->
      <div v-if="workspaces.length > 0" class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <h3 class="text-sm font-medium text-neutral-200 mb-2">Workspaces</h3>
        <div class="space-y-1">
          <div
            v-for="ws in workspaces"
            :key="ws"
            class="py-1 text-sm text-neutral-300 font-mono text-xs"
          >
            {{ ws }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  connectionStatus: 'connected' | 'disconnected' | 'error'
  installStatus: string
  version: string | null
  models: Array<{ name: string; provider: string; model: string }>
  workspaces: string[]
  sessions: Array<{ id: string; title: string; model: string; message_count: number; updated_at: number; source: string }>
}>()

const emit = defineEmits<{
  refreshSessions: []
  resumeSession: [sessionId: string]
}>()

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
</script>
