<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <button
        class="text-neutral-400 hover:text-neutral-200 transition-colors p-1 -ml-1"
        @click="$emit('back')"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-medium text-neutral-200 truncate">{{ pack.name }}</h2>
          <span
            v-if="pack.builtIn"
            class="px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 bg-neutral-800 border border-neutral-700/50 rounded cursor-default"
            title="Always active — cannot be disabled or removed"
          >Built-in</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-neutral-500">{{ pack.id }}</span>
          <span class="text-neutral-700">&middot;</span>
          <span class="text-xs text-neutral-600">v{{ pack.version }}</span>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="space-y-5 overflow-y-auto flex-1">
      <!-- Description -->
      <p v-if="pack.description" class="text-sm text-neutral-400">{{ pack.description }}</p>

      <!-- Status / Controls -->
      <section v-if="!pack.builtIn" class="flex items-center justify-between px-4 py-3 bg-neutral-800/50 border border-neutral-700/50 rounded-lg">
        <span class="text-sm text-neutral-300">{{ pack.enabled ? 'Enabled' : 'Disabled' }}</span>
        <div class="flex items-center gap-3">
          <button
            class="relative w-9 h-5 rounded-full transition-colors"
            :class="pack.enabled ? 'bg-primary-600' : 'bg-neutral-600'"
            @click="$emit('toggle', pack.id)"
            :title="pack.enabled ? 'Disable' : 'Enable'"
          >
            <span
              class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
              :class="pack.enabled ? 'translate-x-4' : 'translate-x-0'"
            />
          </button>
          <button
            class="text-neutral-500 hover:text-red-400 transition-colors text-xs"
            @click="$emit('uninstall', pack.id)"
          >
            Remove
          </button>
        </div>
      </section>

      <!-- Summary stats -->
      <section class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span v-if="pack.features.length">{{ pack.features.length }} features</span>
        <span v-if="entityEntries.length">{{ entityEntries.length }} entities</span>
        <span v-if="relKindEntries.length">{{ relKindEntries.length }} relations</span>
        <span v-if="pack.steps.length">{{ pack.steps.length }} steps</span>
        <span v-if="pack.artifacts.length">{{ pack.artifacts.length }} artifacts</span>
        <span v-if="pack.blocks.length">{{ pack.blocks.length }} blocks</span>
        <span v-if="pack.migrationCount">{{ pack.migrationCount }} migrations</span>
        <span v-if="packServiceNames.length">{{ packServiceNames.length }} pack services</span>
      </section>

      <!-- Extra metadata for external packs -->
      <section v-if="pack.hostVersion || pack.registeredAt || pack.dir" class="space-y-1 text-xs">
        <div v-if="pack.hostVersion" class="flex gap-2">
          <span class="text-neutral-500">Requires host</span>
          <span class="text-neutral-400">{{ pack.hostVersion }}</span>
        </div>
        <div v-if="pack.registeredAt" class="flex gap-2">
          <span class="text-neutral-500">Installed</span>
          <span class="text-neutral-400">{{ formatDate(pack.registeredAt) }}</span>
        </div>
        <div v-if="pack.dir" class="flex gap-2 min-w-0">
          <span class="text-neutral-500 flex-shrink-0">Directory</span>
          <span class="text-neutral-400 truncate" :title="pack.dir">{{ pack.dir }}</span>
        </div>
      </section>

      <!-- Features -->
      <section v-if="pack.features.length > 0">
        <SectionHeader label="Features" :count="pack.features.length" />
        <div class="space-y-2">
          <div
            v-for="feature in pack.features"
            :key="feature.id"
            class="px-3 py-2 bg-neutral-800/40 border border-neutral-700/30 rounded-lg"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm text-neutral-200 font-medium">{{ feature.plugin?.label ?? feature.id }}</span>
              <span
                v-if="feature.designation"
                class="px-1 py-0.5 text-[9px] font-medium text-neutral-500 bg-neutral-800 border border-neutral-700/50 rounded"
              >{{ feature.designation }}</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
              <span v-if="feature.hasSystem">system</span>
              <span v-if="feature.plugin">plugin<template v-if="feature.plugin.isPinned"> (pinned)</template></span>
              <span v-if="feature.services.length">services: {{ feature.services.join(', ') }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Fallback: flat lists when no features (external packs without features manifest) -->
      <template v-if="!pack.features.length">
        <!-- Systems -->
        <section v-if="pack.systems.length > 0">
          <SectionHeader label="Systems" :count="pack.systems.length" />
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="sys in pack.systems"
              :key="sys"
              class="chip"
            >{{ sys }}</span>
          </div>
        </section>

        <!-- Services -->
        <section v-if="pack.services.length > 0">
          <SectionHeader label="Services" :count="pack.services.length" />
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="svc in pack.services"
              :key="svc"
              class="chip"
            >{{ svc }}</span>
          </div>
        </section>

        <!-- Plugins -->
        <section v-if="pack.plugins.length > 0">
          <SectionHeader label="Plugins" :count="pack.plugins.length" />
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="pluginId in pack.plugins"
              :key="pluginId"
              class="chip"
            >{{ pluginId }}</span>
          </div>
        </section>
      </template>

      <!-- Pack-level services (not owned by any feature) -->
      <section v-if="packServiceNames.length > 0">
        <SectionHeader label="Pack Services" :count="packServiceNames.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="svc in packServiceNames"
            :key="svc"
            class="chip"
          >{{ svc }}</span>
        </div>
      </section>

      <!-- Boot Hooks -->
      <section v-if="pack.bootHooks.length > 0">
        <SectionHeader label="Boot Hooks" :count="pack.bootHooks.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="hook in pack.bootHooks"
            :key="hook"
            class="chip"
          >{{ hook }}</span>
        </div>
      </section>

      <!-- Entities -->
      <section v-if="entityEntries.length > 0">
        <SectionHeader label="Entities" :count="entityEntries.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="[key] in entityEntries"
            :key="key"
            class="chip"
          >{{ key }}</span>
        </div>
      </section>

      <!-- Relation Kinds -->
      <section v-if="relKindEntries.length > 0">
        <SectionHeader label="Relation Kinds" :count="relKindEntries.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="[, value] in relKindEntries"
            :key="value"
            class="chip"
          >{{ value }}</span>
        </div>
      </section>

      <!-- Steps -->
      <section v-if="pack.steps.length > 0">
        <SectionHeader label="Steps" :count="pack.steps.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="step in pack.steps"
            :key="step"
            class="chip"
          >{{ step }}</span>
        </div>
      </section>

      <!-- Artifacts -->
      <section v-if="pack.artifacts.length > 0">
        <SectionHeader label="Artifacts" :count="pack.artifacts.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="art in pack.artifacts"
            :key="art"
            class="chip"
          >{{ art }}</span>
        </div>
      </section>

      <!-- Blocks -->
      <section v-if="pack.blocks.length > 0">
        <SectionHeader label="Blocks" :count="pack.blocks.length" />
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="block in pack.blocks"
            :key="block"
            class="chip"
          >{{ block }}</span>
        </div>
      </section>

      <!-- Permissions -->
      <section v-if="pack.permissions.length > 0">
        <SectionHeader label="Permissions" :count="pack.permissions.length" />
        <div class="space-y-1">
          <div
            v-for="perm in pack.permissions"
            :key="perm"
            class="flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border border-amber-500/20 rounded text-sm"
          >
            <Shield class="w-3 h-3 text-amber-500/60 flex-shrink-0" />
            <span class="text-neutral-300">{{ perm }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, Shield } from 'lucide-vue-next';
import type { PackInfo } from '../state';
import SectionHeader from './SectionHeader.vue';

const props = defineProps<{ pack: PackInfo }>();

defineEmits<{
  back: [];
  toggle: [packId: string];
  uninstall: [packId: string];
}>();

const entityEntries = computed(() => Object.entries(props.pack.entities));
const relKindEntries = computed(() => Object.entries(props.pack.relKinds));

const featureServiceNames = computed(() => {
  const names = new Set<string>();
  for (const f of props.pack.features) {
    for (const s of f.services) names.add(s);
  }
  return names;
});

const packServiceNames = computed(() =>
  props.pack.services.filter(s => !featureServiceNames.value.has(s))
);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}
</script>

<style scoped>
.chip {
  @apply px-2 py-1 text-xs text-neutral-300 bg-neutral-800/50 border border-neutral-700/40 rounded font-mono;
}
</style>
