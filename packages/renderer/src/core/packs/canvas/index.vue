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
    <div v-if="error" class="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
      <span class="text-red-400 text-sm">{{ error }}</span>
      <button
        class="text-red-400/60 hover:text-red-400 transition-colors p-1"
        @click="dismissError"
        title="Dismiss"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Install section -->
    <div class="mb-6">
      <h3 class="text-sm font-medium text-neutral-400 mb-2">Install Pack</h3>
      <div class="flex gap-2">
        <input
          v-model="installInput"
          type="text"
          placeholder="owner/repo, owner/repo@tag, or local path"
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

    <!-- External packs -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium text-neutral-400">External</h3>
        <span v-if="externalPacks.length > 0" class="text-xs text-neutral-600">{{ externalPacks.length }} {{ externalPacks.length === 1 ? 'pack' : 'packs' }}</span>
      </div>

      <div v-if="externalPacks.length === 0" class="py-12 text-center border border-dashed border-neutral-700/50 rounded-lg">
        <PackageIcon class="w-10 h-10 text-neutral-700 mx-auto mb-3" />
        <p class="text-neutral-500 text-sm mb-1">No external packs installed</p>
        <p class="text-neutral-600 text-xs">Install a pack from GitHub or a local directory</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="pack in externalPacks"
          :key="pack.id"
          class="px-4 py-3 bg-neutral-800/50 border border-neutral-700/50 rounded-lg"
        >
          <!-- Uninstall confirmation overlay -->
          <div v-if="confirmingUninstall === pack.id" class="flex items-center justify-between">
            <span class="text-sm text-neutral-300">Remove <strong>{{ pack.name }}</strong>? This deletes the pack directory.</span>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                class="px-3 py-1 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
                @click="cancelUninstall"
              >
                Cancel
              </button>
              <button
                class="px-3 py-1 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                @click="confirmUninstall(pack.id)"
              >
                Remove
              </button>
            </div>
          </div>

          <!-- Normal pack row -->
          <div v-else class="flex items-center justify-between">
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm text-neutral-200">{{ pack.name }}</span>
                <span class="text-xs text-neutral-600">v{{ pack.version }}</span>
              </div>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="text-xs text-neutral-500">{{ pack.id }}</span>
                <template v-if="pack.entityCount > 0">
                  <span class="text-neutral-700">&middot;</span>
                  <span class="text-xs text-neutral-500">{{ pack.entityCount }} {{ pack.entityCount === 1 ? 'entity' : 'entities' }}</span>
                </template>
                <template v-if="pack.hasFeEntry">
                  <span class="text-neutral-700">&middot;</span>
                  <span class="text-xs text-neutral-500">UI</span>
                </template>
                <template v-if="pack.hostVersion">
                  <span class="text-neutral-700">&middot;</span>
                  <span class="text-xs text-neutral-500">requires {{ pack.hostVersion }}</span>
                </template>
              </div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
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
              <button
                class="text-neutral-500 hover:text-red-400 transition-colors text-xs"
                @click="promptUninstall(pack.id)"
                title="Uninstall"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Built-in packs -->
    <div v-if="builtInPacks.length > 0">
      <h3 class="text-sm font-medium text-neutral-400 mb-3">Built-in</h3>
      <div class="space-y-2">
        <div
          v-for="pack in builtInPacks"
          :key="pack.id"
          class="flex items-center justify-between px-4 py-3 bg-neutral-800/30 border border-neutral-700/30 rounded-lg"
        >
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm text-neutral-200">{{ pack.name }}</span>
              <span class="text-xs text-neutral-600">v{{ pack.version }}</span>
            </div>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="text-xs text-neutral-500">{{ pack.id }}</span>
              <template v-if="pack.entityCount > 0">
                <span class="text-neutral-700">&middot;</span>
                <span class="text-xs text-neutral-500">{{ pack.entityCount }} {{ pack.entityCount === 1 ? 'entity' : 'entities' }}</span>
              </template>
              <template v-if="pack.hasFeEntry">
                <span class="text-neutral-700">&middot;</span>
                <span class="text-xs text-neutral-500">UI</span>
              </template>
            </div>
          </div>
          <span class="text-xs text-neutral-600 flex-shrink-0">Always active</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { useActorSystem } from '@abuddy/sdk/fe';
import { Package as PackageIcon, X } from 'lucide-vue-next';
import type { PacksState } from '../state';
import { id } from '../state';

const actorSystem = useActorSystem();
const actor: PacksState = actorSystem.get(id);

const packs = useSelector(actor, s => s.context.packs);
const builtInPacks = computed(() => packs.value.filter(p => p.builtIn));
const externalPacks = computed(() => packs.value.filter(p => !p.builtIn));
const installing = useSelector(actor, s => s.context.installing);
const confirmingUninstall = useSelector(actor, s => s.context.confirmingUninstall);
const pendingChanges = useSelector(actor, s => s.context.pendingChanges);
const error = useSelector(actor, s => s.context.error);

const installInput = ref('');

function handleInstall() {
  const value = installInput.value.trim();
  if (!value) return;

  const isLocal = value.startsWith('/') || value.startsWith('~') || value.startsWith('.');
  actor.send({
    type: 'UI.INSTALL',
    packSlug: value,
    source: isLocal ? 'local' : undefined,
  });
  installInput.value = '';
}

function toggleEnabled(packId: string) {
  actor.send({ type: 'UI.TOGGLE_ENABLED', packId });
}

function promptUninstall(packId: string) {
  actor.send({ type: 'UI.CONFIRM_UNINSTALL', packId });
}

function cancelUninstall() {
  actor.send({ type: 'UI.CANCEL_UNINSTALL' });
}

function confirmUninstall(packId: string) {
  actor.send({ type: 'UI.UNINSTALL', packId });
}

function dismissError() {
  actor.send({ type: 'UI.DISMISS_ERROR' });
}

function restartApp() {
  window.electronAPI?.apiStatus?.relaunch();
}
</script>
