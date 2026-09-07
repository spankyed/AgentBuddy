<template>
  <div class="packs-canvas flex flex-col h-full p-6 overflow-y-auto">
    <!-- Restart banner -->
    <div v-if="pendingChanges" class="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
      <span class="text-amber-400 text-sm">Changes require a restart to take effect.</span>
      <button
        class="ml-4 px-3 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded transition-colors"
        @click="restartApp"
      >
        Restart Now
      </button>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
      <span class="text-red-400 text-sm">{{ error }}</span>
    </div>

    <!-- Install section -->
    <div class="mb-6">
      <h3 class="text-sm font-medium text-neutral-400 mb-3">Install Pack</h3>
      <div class="flex gap-2">
        <input
          v-model="installInput"
          type="text"
          placeholder="GitHub slug (owner/repo) or local path"
          class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500"
          @keydown.enter="handleInstall"
          :disabled="!!installing"
        />
        <button
          class="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          @click="handleInstall"
          :disabled="!installInput.trim() || !!installing"
        >
          {{ installing ? 'Installing...' : 'Install' }}
        </button>
      </div>
    </div>

    <!-- Pack list -->
    <div>
      <h3 class="text-sm font-medium text-neutral-400 mb-3">Installed Packs</h3>
      <div v-if="packs.length === 0" class="text-neutral-500 text-sm py-8 text-center">
        No external packs installed.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="pack in packs"
          :key="pack.id"
          class="flex items-center justify-between px-4 py-3 bg-neutral-800/50 border border-neutral-700/50 rounded-lg"
        >
          <div class="flex flex-col">
            <span class="text-sm text-neutral-200">{{ pack.name }}</span>
            <span class="text-xs text-neutral-500">{{ pack.id }} · v{{ pack.version }}</span>
          </div>
          <div class="flex items-center gap-3">
            <!-- Enable/Disable toggle -->
            <button
              class="relative w-9 h-5 rounded-full transition-colors"
              :class="pack.enabled ? 'bg-primary-600' : 'bg-neutral-600'"
              @click="toggleEnabled(pack.id)"
              :title="pack.enabled ? 'Disable' : 'Enable'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                :class="pack.enabled ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>
            <!-- Uninstall -->
            <button
              class="text-neutral-500 hover:text-red-400 transition-colors text-xs"
              @click="uninstall(pack.id)"
              title="Uninstall"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSelector } from '@xstate/vue';
import type { PacksState } from '../state';

const props = defineProps<{ actor: PacksState }>();

const packs = useSelector(props.actor, s => s.context.packs);
const installing = useSelector(props.actor, s => s.context.installing);
const pendingChanges = useSelector(props.actor, s => s.context.pendingChanges);
const error = useSelector(props.actor, s => s.context.error);

const installInput = ref('');

function handleInstall() {
  const value = installInput.value.trim();
  if (!value) return;

  const isLocal = value.startsWith('/') || value.startsWith('~') || value.startsWith('.');
  props.actor.send({
    type: 'UI.INSTALL',
    packSlug: value,
    source: isLocal ? 'local' : undefined,
  });
  installInput.value = '';
}

function toggleEnabled(packId: string) {
  props.actor.send({ type: 'UI.TOGGLE_ENABLED', packId });
}

function uninstall(packId: string) {
  props.actor.send({ type: 'UI.UNINSTALL', packId });
}

function restartApp() {
  window.electronAPI?.apiStatus?.relaunch();
}
</script>
