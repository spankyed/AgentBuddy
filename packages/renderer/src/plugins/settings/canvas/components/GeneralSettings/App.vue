<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Application</h2>
      <p class="text-sm text-neutral-500">
        Import setup packs, configure hotkeys, and manage app data.
      </p>
    </div>

    <!-- Hotkeys Section -->
    <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 mb-6">
      <Hotkeys
        :settings="props.settings?.hotkeys"
        @update-setting="onHotkeyUpdate"
      />
    </div>

    <!-- Browser Section -->
    <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 mb-6">
      <div class="flex items-center gap-2 mb-4">
        <Globe class="w-4 h-4 text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-300 uppercase tracking-wider">Browser</h3>
      </div>
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          :checked="props.settings?.openLinksInApp ?? true"
          @change="emit('update-setting', { path: ['openLinksInApp'], value: ($event.target as HTMLInputElement).checked })"
          class="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
        <span class="text-sm text-neutral-300">Open links in the built-in browser</span>
      </label>
      <p class="text-xs text-neutral-500 mt-2 ml-7">When disabled, links open in your default system browser.</p>
    </div>

    <!-- Data Management -->
    <div class="space-y-6">
      <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
        <div class="flex items-center gap-2 mb-4">
          <PackageOpen class="w-4 h-4 text-neutral-400" />
          <h3 class="text-sm font-medium text-neutral-300 uppercase tracking-wider">Import Setup Pack</h3>
        </div>

        <p class="text-sm text-neutral-500 mb-4">
          Import compiled actions, prompts, flows, library docs, and notes from a setup pack directory.
        </p>

        <!-- Idle / previewing: show the select-directory button -->
        <button
          v-if="status === 'idle' || status === 'previewing'"
          @click="selectDirectory"
          :disabled="status === 'previewing'"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            status === 'previewing'
              ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          ]"
        >
          {{ status === 'previewing' ? 'Reading pack...' : 'Select Compiled Directory...' }}
        </button>

        <!-- Selecting: show the picker -->
        <ImportSetupPackPicker
          v-else-if="status === 'selecting' || status === 'importing'"
          :preview="preview!"
          :selection="selection"
          :expanded="expanded"
          :import-mode="importMode"
          :restart-brain="restartBrainFlag"
          :importing="status === 'importing'"
          @toggle-expand="onToggleExpand"
          @toggle-type-all="onToggleTypeAll"
          @toggle-item="onToggleItem"
          @set-mode="onSetMode"
          @toggle-restart-brain="onToggleRestartBrain"
          @confirm="onConfirm"
          @cancel="onCancel"
        />

        <!-- Success result -->
        <div v-if="status === 'success' && importResult" class="mt-4 p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
          <p class="text-sm text-green-400 font-medium mb-2">Import complete</p>
          <div class="text-xs text-green-500/80 space-y-0.5">
            <p>Actions — {{ importResult.actions.created }} created, {{ importResult.actions.updated }} updated</p>
            <p>Prompts — {{ importResult.prompts.created }} created, {{ importResult.prompts.updated }} updated</p>
            <p>Flows — {{ importResult.flows.created }} created, {{ importResult.flows.skipped }} skipped</p>
            <p>Library — {{ importResult.library.created }} created, {{ importResult.library.updated }} updated</p>
            <p>Notes — {{ importResult.notes.created }} created, {{ importResult.notes.updated }} updated</p>
          </div>
          <button
            @click="onReset"
            class="mt-3 text-xs text-green-500/80 hover:text-green-400 underline"
          >
            Import another pack
          </button>
        </div>

        <div v-if="status === 'error' && importError" class="mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
          <p class="text-sm text-red-400">Import failed: {{ importError }}</p>
          <button
            @click="onReset"
            class="mt-3 text-xs text-red-500/80 hover:text-red-400 underline"
          >
            Try again
          </button>
        </div>
      </div>
    </div>

    <!-- Reset App -->
    <div class="mt-8 bg-red-900/10 border border-red-800/30 rounded-xl p-6">
      <div class="flex items-center gap-2 mb-2">
        <RotateCcw class="w-4 h-4 text-red-400" />
        <h3 class="text-sm font-medium text-red-400 uppercase tracking-wider">Reset App</h3>
      </div>
      <p class="text-sm text-neutral-500 mb-4">
        Erase all data and restore defaults. This cannot be undone.
      </p>
      <button
        v-if="!confirmingReset"
        @click="confirmingReset = true"
        class="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
      >
        Reset App...
      </button>
      <div v-else class="flex items-center gap-3">
        <span class="text-sm text-red-400">Are you sure?</span>
        <button
          @click="onResetApp"
          :disabled="resetting"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ resetting ? 'Resetting…' : 'Yes, erase everything' }}
        </button>
        <button
          @click="confirmingReset = false"
          :disabled="resetting"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { Globe, PackageOpen, RotateCcw } from 'lucide-vue-next'
import type { SetupPackType } from '@app/api'
import ImportSetupPackPicker from './ImportSetupPackPicker.vue'
import Hotkeys from './Hotkeys.vue'

interface Props {
  settings?: any
}

const props = withDefaults(defineProps<Props>(), {
  settings: null
})

const emit = defineEmits<{
  'update-setting': [{ path: string[]; value: any }]
}>()

function onHotkeyUpdate(event: { path: string[]; value: any }) {
  emit('update-setting', {
    path: ['hotkeys', ...event.path],
    value: event.value
  })
}

const actor = applicationState.system.get('settings')

const setupPackImport = useSelector(actor, (state: any) => state.context.setupPackImport)
const resetting = useSelector(actor, (state: any) => state.context.resetting)

const status = computed(() => setupPackImport.value?.status ?? 'idle')
const preview = computed(() => setupPackImport.value?.preview ?? null)
const selection = computed(() => setupPackImport.value?.selection)
const expanded = computed(() => setupPackImport.value?.expanded)
const importMode = computed(() => setupPackImport.value?.importMode ?? 'replace-on-collision')
const restartBrainFlag = computed(() => setupPackImport.value?.restartBrain ?? false)
const importResult = computed(() => setupPackImport.value?.result)
const importError = computed(() => setupPackImport.value?.error)

async function selectDirectory() {
  const result = await (window as any).electronAPI?.fileUtils?.selectPath?.({ type: 'directory' })
  if (!result) return
  actor.send({ type: 'SETUP_PACK.PREVIEW', directory: result })
}

function onToggleExpand(key: SetupPackType) {
  actor.send({ type: 'SETUP_PACK.TOGGLE_EXPAND', key })
}

function onToggleTypeAll(key: SetupPackType) {
  actor.send({ type: 'SETUP_PACK.TOGGLE_TYPE_ALL', key })
}

function onToggleItem(payload: { key: SetupPackType; item: string }) {
  actor.send({ type: 'SETUP_PACK.TOGGLE_ITEM', key: payload.key, item: payload.item })
}

function onSetMode(mode: string) {
  actor.send({ type: 'SETUP_PACK.SET_MODE', mode } as any)
}

function onToggleRestartBrain() {
  actor.send({ type: 'SETUP_PACK.TOGGLE_RESTART_BRAIN' })
}

function onConfirm() {
  actor.send({ type: 'SETUP_PACK.CONFIRM_IMPORT' })
}

function onCancel() {
  actor.send({ type: 'SETUP_PACK.CANCEL' })
}

function onReset() {
  actor.send({ type: 'SETUP_PACK.RESET_STATUS' })
}

// Reset App
const confirmingReset = ref(false)

function onResetApp() {
  actor.send({ type: 'APP.RESET' })
}
</script>
