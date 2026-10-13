<template>
  <div class="packs-canvas flex flex-col h-full p-6 overflow-y-auto">
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

    <!-- Detail view -->
    <PackDetail
      v-if="selectedPack"
      :pack="selectedPack"
      :app-source="appPackSources.find(source => source.id === selectedPack!.id)"
      :busy="!!installing"
      :confirming-uninstall="confirmingUninstall === selectedPack.id"
      :updating="updatingPackId === selectedPack.id"
      @back="actor.send({ type: 'UI.BACK' })"
      @toggle="(id) => actor.send({ type: 'UI.TOGGLE_ENABLED', packId: id })"
      @uninstall="(id) => actor.send({ type: 'UI.CONFIRM_UNINSTALL', packId: id })"
      @replace="handleReplace"
      @restore="(revision) => actor.send({ type: 'UI.RESTORE', packId: selectedPack!.id, sourceRevision: revision })"
      @confirm-uninstall="(id) => confirmUninstall(id)"
      @cancel-uninstall="cancelUninstall"
      @update="(id) => actor.send({ type: 'UI.UPDATE', packId: id })"
      @restore-content="(key) => actor.send({ type: 'UI.RESTORE_CONTENT', packId: selectedPack!.id, key })"
      @dismiss-offer="(key) => actor.send({ type: 'UI.DISMISS_OFFER', packId: selectedPack!.id, key })"
      @delete-content="(key) => actor.send({ type: 'UI.DELETE_CONTENT', packId: selectedPack!.id, key })"
    />

    <!-- List view -->
    <template v-else>
      <!-- Install section -->
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-2">
          <h3 class="text-sm font-medium text-neutral-400">{{ installMode === 'replace' ? 'Replace pack by ID' : 'Install pack' }}</h3>
          <select v-model="installMode" aria-label="Pack operation" class="bg-neutral-800 text-xs text-neutral-300 rounded" :disabled="!!installing">
            <option value="install">Install</option>
            <option value="replace">Replace by ID</option>
          </select>
        </div>
        <input v-if="installMode === 'replace'" v-model="replacementId" aria-label="Replacement pack ID" placeholder="Pack ID" :disabled="!!installing"
          class="w-full mb-2 px-3 py-2 bg-neutral-800 rounded-lg text-sm text-neutral-200" />
        <p v-if="installMode === 'replace'" class="text-xs text-neutral-400 mb-2">The source must have this ID. Replaces installed files, keeps stored settings, and makes updates user-managed.</p>
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
            :disabled="!installInput.trim() || !!installing || (installMode === 'replace' && !replacementId.trim())"
          >
            {{ installing ? 'Installing...' : installMode === 'replace' ? 'Replace' : 'Install' }}
          </button>
        </div>
      </div>

      <!-- Installed packs -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium text-neutral-400">Installed packs</h3>
          <div class="flex items-center gap-3">
            <button
              v-if="packs.length > 0"
              class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              @click="actor.send({ type: 'UI.CHECK_UPDATES' })"
            >
              Check for updates
            </button>
            <span v-if="packs.length > 0" class="text-xs text-neutral-600">{{ packs.length }} {{ packs.length === 1 ? 'pack' : 'packs' }}</span>
          </div>
        </div>

        <div v-if="packs.length === 0" class="py-12 text-center border border-dashed border-neutral-700/50 rounded-lg">
          <PackageIcon class="w-10 h-10 text-neutral-700 mx-auto mb-3" />
          <p class="text-neutral-500 text-sm mb-1">No packs installed</p>
          <p class="text-neutral-600 text-xs">Install a pack from GitHub or a local directory</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="pack in packs"
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
            <div
              v-else
              class="flex items-center justify-between cursor-pointer"
              @click="selectPack(pack.id)"
            >
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-neutral-200">{{ pack.name }}</span>
                  <span v-if="pack.version" class="text-xs text-neutral-600">v{{ pack.version }}</span>
                  <span
                    v-if="pack.availableVersion"
                    class="w-2 h-2 rounded-full bg-emerald-400"
                    :title="`v${pack.availableVersion} available`"
                  />
                </div>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="text-xs text-neutral-500">{{ pack.id }}</span>
                  <template v-if="pack.entityCount > 0">
                    <span class="text-neutral-700">&middot;</span>
                    <span class="text-xs text-neutral-500">{{ pack.entityCount }} {{ pack.entityCount === 1 ? 'entity' : 'entities' }}</span>
                  </template>
                  <template v-if="pack.hasFrontend">
                    <span class="text-neutral-700">&middot;</span>
                    <span class="text-xs text-neutral-500">UI</span>
                  </template>
                  <template v-if="pack.hostVersion">
                    <span class="text-neutral-700">&middot;</span>
                    <span class="text-xs text-neutral-500">requires {{ pack.hostVersion }}</span>
                  </template>
                </div>
                <p v-if="pack.loadProblem" class="text-xs text-red-400 mt-1 break-words" data-testid="pack-load-problem">
                  Failed to load: {{ pack.loadProblem }}
                </p>
                <ContentOfferNotice :count="pack.contentOffers.length" />
              </div>
              <div class="flex items-center gap-3 flex-shrink-0" @click.stop>
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

      <section v-if="missingDefaults.length" class="space-y-2" data-testid="missing-app-defaults">
        <h3 class="text-sm font-medium text-neutral-400">Available app defaults</h3>
        <div v-for="source in missingDefaults" :key="source.id" class="flex items-center justify-between px-4 py-3 bg-neutral-800/30 rounded-lg">
          <span class="text-sm text-neutral-300">{{ source.name }} v{{ source.version }}</span>
          <button :disabled="!!installing" class="text-xs text-primary-400 disabled:opacity-50"
            @click="actor.send({ type: 'UI.RESTORE', packId: source.id, sourceRevision: source.sourceRevision })">Restore</button>
        </div>
      </section>
      <p v-for="problem in appPackSourceProblems" :key="`${problem.id}:${problem.message}`"
        class="text-xs text-amber-400 mt-3 break-words" data-testid="app-source-problem">
        {{ problem.id }}: {{ problem.message }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { usePlugin } from '@apackdev/sdk/fe';
import { Package as PackageIcon, X } from 'lucide-vue-next';
import type { PacksState } from '@apackdev/host/fe';
import PackDetail from './PackDetail.vue';
import ContentOfferNotice from './ContentOfferNotice.vue';

const actor = usePlugin<PacksState>();

const packs = useSelector(actor, s => s.context.packs);
const appPackSources = useSelector(actor, s => s.context.appPackSources);
const appPackSourceProblems = useSelector(actor, s => s.context.appPackSourceProblems);
const missingDefaults = computed(() => appPackSources.value.filter(source => !packs.value.some(pack => pack.id === source.id)));
const selectedPackId = useSelector(actor, s => s.context.selectedPackId);
const selectedPack = computed(() => {
  if (!selectedPackId.value) return null;
  return packs.value.find(p => p.id === selectedPackId.value) ?? null;
});
const installing = useSelector(actor, s => s.context.installing);
const confirmingUninstall = useSelector(actor, s => s.context.confirmingUninstall);
const updatingPackId = useSelector(actor, s => s.context.updatingPackId);
const error = useSelector(actor, s => s.context.error);

const installInput = ref('');
const installMode = ref<'install' | 'replace'>('install');
const replacementId = ref('');

function selectPack(packId: string) {
  actor.send({ type: 'UI.SELECT_PACK', packId });
}

function handleReplace(source: string) {
  if (!selectedPack.value) return;
  const isLocal = source.startsWith('/') || source.startsWith('~') || source.startsWith('.');
  actor.send({ type: 'UI.REPLACE', packId: selectedPack.value.id, packSlug: source, sourceKind: isLocal ? 'local' : undefined });
}

function handleInstall() {
  const value = installInput.value.trim();
  if (!value || (installMode.value === 'replace' && !replacementId.value.trim())) return;

  const isLocal = value.startsWith('/') || value.startsWith('~') || value.startsWith('.');
  if (installMode.value === 'replace') {
    actor.send({ type: 'UI.REPLACE', packId: replacementId.value.trim(), packSlug: value, sourceKind: isLocal ? 'local' : undefined });
  } else {
    actor.send({ type: 'UI.INSTALL', packSlug: value, sourceKind: isLocal ? 'local' : undefined });
  }
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


</script>
