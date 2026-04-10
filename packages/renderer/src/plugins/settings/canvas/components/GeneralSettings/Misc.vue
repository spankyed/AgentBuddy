<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Miscellaneous</h2>
      <p class="text-sm text-neutral-500">
        Import setup packs and other configuration options.
      </p>
    </div>

    <!-- Import Setup Pack -->
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
          :importing="status === 'importing'"
          @toggle-expand="onToggleExpand"
          @toggle-type-all="onToggleTypeAll"
          @toggle-item="onToggleItem"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { PackageOpen } from 'lucide-vue-next'
import type { SetupPackType } from '@app/api'
import ImportSetupPackPicker from './ImportSetupPackPicker.vue'

const actor = applicationState.system.get('settings')

const setupPackImport = useSelector(actor, (state: any) => state.context.setupPackImport)

const status = computed(() => setupPackImport.value?.status ?? 'idle')
const preview = computed(() => setupPackImport.value?.preview ?? null)
const selection = computed(() => setupPackImport.value?.selection)
const expanded = computed(() => setupPackImport.value?.expanded)
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

function onConfirm() {
  actor.send({ type: 'SETUP_PACK.CONFIRM_IMPORT' })
}

function onCancel() {
  actor.send({ type: 'SETUP_PACK.CANCEL' })
}

function onReset() {
  actor.send({ type: 'SETUP_PACK.RESET_STATUS' })
}
</script>
