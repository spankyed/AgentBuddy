<template>
  <div class="flex-1 min-h-0 overflow-auto p-8">
    <div class="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 class="text-lg font-semibold text-white mb-1">Services</h2>
        <p class="text-sm text-neutral-400">Install services from GitHub repos to extend <code class="text-xs bg-neutral-800 px-1 py-0.5 rounded">services.*</code> in actions and flows.</p>
      </div>

      <!-- Install form -->
      <div class="flex gap-3">
        <input
          v-model="installUrl"
          type="text"
          placeholder="GitHub URL (e.g. github.com/user/my-service)"
          class="flex-1 px-4 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          :disabled="installing"
          @keydown.enter="handleInstall"
        />
        <button
          @click="handleInstall"
          :disabled="!installUrl.trim() || installing"
          class="px-4 py-2 text-sm font-medium rounded-md transition-colors shrink-0"
          :class="installing
            ? 'bg-neutral-700 text-neutral-400 cursor-wait'
            : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'"
        >
          {{ installing ? 'Installing...' : 'Install' }}
        </button>
      </div>

      <!-- Installed services list -->
      <div v-if="Object.keys(services).length > 0" class="space-y-3">
        <div
          v-for="(entry, key) in services"
          :key="key"
          class="bg-neutral-800 border border-neutral-700 rounded-lg p-4"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="{
                  'bg-green-500': entry.status === 'ok' && entry.enabled,
                  'bg-neutral-500': entry.status === 'ok' && !entry.enabled,
                  'bg-red-500': entry.status === 'error',
                  'bg-yellow-500': entry.status === 'installing',
                }"
              />
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-white">{{ entry.displayName }}</span>
                  <code class="text-xs text-neutral-500">services.{{ key }}</code>
                </div>
                <p v-if="entry.description" class="text-xs text-neutral-400 truncate">{{ entry.description }}</p>
                <p v-if="entry.status === 'error'" class="text-xs text-red-400 mt-1">{{ entry.error }}</p>
              </div>
            </div>

            <div class="flex items-center gap-3 shrink-0">
              <!-- Enable/disable toggle -->
              <button
                @click="handleToggle(key as string, !entry.enabled)"
                class="relative w-9 h-5 rounded-full transition-colors"
                :class="entry.enabled ? 'bg-blue-600' : 'bg-neutral-600'"
              >
                <span
                  class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                  :class="entry.enabled ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </button>
              <!-- Uninstall -->
              <button
                @click="handleUninstall(key as string)"
                class="text-neutral-500 hover:text-red-400 transition-colors"
                title="Uninstall"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Config fields -->
          <div v-if="entry.config && Object.keys(entry.config).length > 0" class="mt-4 pt-3 border-t border-neutral-700 space-y-3">
            <div v-for="(field, fieldKey) in entry.config" :key="fieldKey">
              <label class="block text-xs text-neutral-400 mb-1">{{ field.label }}</label>
              <input
                v-if="field.type === 'string' || field.type === 'number'"
                :type="field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'"
                :value="entry.configValues?.[fieldKey] ?? field.default ?? ''"
                @change="handleConfigChange(key as string, fieldKey as string, ($event.target as HTMLInputElement).value, entry)"
                class="w-full px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
              />
              <select
                v-else-if="field.type === 'enum'"
                :value="entry.configValues?.[fieldKey] ?? field.default ?? ''"
                @change="handleConfigChange(key as string, fieldKey as string, ($event.target as HTMLSelectElement).value, entry)"
                class="w-full px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
              >
                <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-12">
        <p class="text-sm text-neutral-500">No services installed yet.</p>
        <p class="text-xs text-neutral-600 mt-1">Paste a GitHub URL above to get started.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { trpc } from '@/core/trpc'
import type { ServiceEntry } from '@app/api'

const id = 'settings'
const actor = applicationState.system.get(id)

const settings = useSelector(actor, (state: any) => state.context.settings)
const services = computed<Record<string, ServiceEntry>>(() => settings.value?.internal?.services ?? {})

const installUrl = ref('')
const installing = ref(false)

function handleInstall() {
  const url = installUrl.value.trim()
  if (!url || installing.value) return
  installing.value = true
  trpc.bus.send.mutate({ systemId: id, type: 'INSTALL_SERVICE', url } as any)
  installUrl.value = ''
  // installing state resets when SETTINGS_UPDATED arrives (service appears in list)
  setTimeout(() => { installing.value = false }, 30_000) // safety timeout
}

function handleUninstall(key: string) {
  trpc.bus.send.mutate({ systemId: id, type: 'UNINSTALL_SERVICE', key } as any)
}

function handleToggle(key: string, enabled: boolean) {
  trpc.bus.send.mutate({ systemId: id, type: 'TOGGLE_SERVICE', key, enabled } as any)
}

function handleConfigChange(key: string, fieldKey: string, value: any, entry: ServiceEntry) {
  const configValues = { ...entry.configValues, [fieldKey]: value }
  trpc.bus.send.mutate({ systemId: id, type: 'UPDATE_SERVICE_CONFIG', key, configValues } as any)
}
</script>
