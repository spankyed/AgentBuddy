<template>
  <div class="h-full min-h-0" :data-contribution-owner="owner" :data-contribution-area="area">
    <div v-if="failure" key="failure" role="alert" class="p-4 text-sm text-neutral-300">
      <p class="font-medium">{{ owner }}: {{ area }} couldn't be displayed.</p>
      <p class="mt-2 text-neutral-400">{{ failure.message }}</p>
      <button class="mt-3 underline disabled:opacity-50" :disabled="!eligible" @click="retry">Retry</button>
    </div>
    <div v-else-if="eligible" :key="`view-${attempt}`" class="h-full min-h-0"><slot /></div>
    <p v-else class="p-4 text-sm text-neutral-400">This contribution is no longer available.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onErrorCaptured, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { hostDeclaration } from '@apackdev/host/fe';
import { isRecoverableMonacoError } from '@apackdev/ui/components/monaco-error-filters';
import { fePacks } from '@/runtime/packs';
import { windowCatalog } from '@/runtime/catalog';
import { reportRendererError } from '@/boot/errors';
import { currentFrontendIdentity } from './contribution-owner';

const props = defineProps<{
  packId: string; owner: string; area: string; current: () => boolean; resetKey?: string;
}>();
const revision = shallowRef(0);
onScopeDispose(fePacks.onChanged(packId => { if (packId === props.packId) revision.value++; }));
onScopeDispose(windowCatalog.subscribe(() => { revision.value++; }));
const identity = computed(() => { void revision.value; return currentFrontendIdentity(props.packId); });
const eligible = computed(() => !!identity.value && props.current());
const failure = shallowRef<{ message: string; identity: typeof identity.value }>();
const attempt = ref(0);
watch([identity, () => props.owner, () => props.resetKey], () => { failure.value = undefined; attempt.value++; }, { flush: 'sync' });
onErrorCaptured((error, _instance, info) => {
  if (isRecoverableMonacoError(error)) return false;
  if (props.packId === hostDeclaration.id) return;
  failure.value = { message: error instanceof Error ? error.message : String(error), identity: identity.value };
  reportRendererError('pack.component', error, { packId: props.packId, owner: props.owner, area: props.area, info }, false);
  return false;
});
function retry() {
  if (!failure.value || !props.current() || !identity.value
    || currentFrontendIdentity(props.packId) !== failure.value.identity) return;
  failure.value = undefined;
  attempt.value++;
}
</script>
