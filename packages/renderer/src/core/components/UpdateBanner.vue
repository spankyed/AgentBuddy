<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Download, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-vue-next';

type UpdateInfo = { version: string; releaseNotes?: string | { version: string; note: string }[] };
type ProgressInfo = { percent: number; bytesPerSecond: number; transferred: number; total: number };

const state = ref<'idle' | 'available' | 'downloading' | 'ready'>('idle');
const updateInfo = ref<UpdateInfo | null>(null);
const progress = ref<ProgressInfo | null>(null);
const showChangelog = ref(false);
const dismissedVersion = ref<string | null>(null);

const changelog = computed(() => {
  if (!updateInfo.value?.releaseNotes) return '';
  const notes = updateInfo.value.releaseNotes;
  return typeof notes === 'string'
    ? notes
    : notes.map(n => n.note).join('\n');
});

const downloadPercent = computed(() => Math.round(progress.value?.percent ?? 0));

const downloadSpeed = computed(() => {
  const bps = progress.value?.bytesPerSecond ?? 0;
  if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps > 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps} B/s`;
});

const cleanups: (() => void)[] = [];

onMounted(() => {
  const api = window.electronAPI?.appUpdate;
  if (!api) return;

  cleanups.push(api.onUpdateAvailable((info) => {
    if (dismissedVersion.value === info.version) return;
    updateInfo.value = info;
    state.value = 'available';
  }));

  cleanups.push(api.onDownloadProgress((p) => {
    progress.value = p;
    state.value = 'downloading';
  }));

  cleanups.push(api.onUpdateDownloaded((info) => {
    updateInfo.value = info;
    state.value = 'ready';
  }));

  cleanups.push(api.onUpdateError(() => {
    // Reset to available so user can retry
    if (state.value === 'downloading') {
      state.value = 'available';
    }
  }));
});

onUnmounted(() => {
  cleanups.forEach(fn => fn());
});

function startDownload() {
  window.electronAPI?.appUpdate.startDownload();
  state.value = 'downloading';
}

function installAndRestart() {
  window.electronAPI?.appUpdate.installAndRestart();
}

function dismiss() {
  const version = updateInfo.value?.version;
  if (version) {
    dismissedVersion.value = version;
    window.electronAPI?.appUpdate.dismissUpdate(version);
  }
  state.value = 'idle';
  updateInfo.value = null;
  progress.value = null;
  showChangelog.value = false;
}

function later() {
  state.value = 'idle';
}
</script>

<template>
  <div v-if="state !== 'idle'" class="update-banner flex items-center gap-3 px-4 py-2 bg-blue-900/80 text-blue-100 text-sm border-b border-blue-700/50 backdrop-blur-sm">
    <!-- Available state -->
    <template v-if="state === 'available'">
      <Download class="w-4 h-4 shrink-0" />
      <span>v{{ updateInfo?.version }} available</span>
      <button
        @click="showChangelog = !showChangelog"
        class="flex items-center gap-1 text-blue-300 hover:text-blue-100 transition-colors"
      >
        What's New
        <ChevronDown v-if="!showChangelog" class="w-3 h-3" />
        <ChevronUp v-else class="w-3 h-3" />
      </button>
      <div class="flex-1" />
      <button
        @click="startDownload"
        class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
      >
        Update
      </button>
      <button @click="dismiss" class="text-blue-400 hover:text-blue-200 transition-colors">
        <X class="w-4 h-4" />
      </button>
    </template>

    <!-- Downloading state -->
    <template v-else-if="state === 'downloading'">
      <Download class="w-4 h-4 shrink-0 animate-pulse" />
      <span>Downloading v{{ updateInfo?.version }}...</span>
      <div class="flex-1 mx-2">
        <div class="w-full bg-blue-950/50 rounded-full h-1.5">
          <div
            class="bg-blue-400 h-1.5 rounded-full transition-all duration-300"
            :style="{ width: `${downloadPercent}%` }"
          />
        </div>
      </div>
      <span class="text-blue-300 text-xs whitespace-nowrap">{{ downloadPercent }}% · {{ downloadSpeed }}</span>
    </template>

    <!-- Ready state -->
    <template v-else-if="state === 'ready'">
      <RotateCcw class="w-4 h-4 shrink-0" />
      <span>v{{ updateInfo?.version }} ready to install</span>
      <div class="flex-1" />
      <button
        @click="installAndRestart"
        class="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-medium transition-colors"
      >
        Restart Now
      </button>
      <button
        @click="later"
        class="px-3 py-1 text-blue-300 hover:text-blue-100 text-xs transition-colors"
      >
        Later
      </button>
    </template>
  </div>

  <!-- Changelog dropdown -->
  <div
    v-if="state === 'available' && showChangelog && changelog"
    class="px-4 py-3 bg-blue-950/60 text-blue-200 text-xs border-b border-blue-700/50 whitespace-pre-wrap max-h-40 overflow-y-auto"
  >
    {{ changelog }}
  </div>
</template>
