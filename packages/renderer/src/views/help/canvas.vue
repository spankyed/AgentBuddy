<template>
  <div class="flex flex-col h-full bg-neutral-900 text-neutral-200" data-testid="help-reader">
    <header class="flex items-center gap-3 p-4 border-b border-neutral-800">
      <button aria-label="Back to help index" @click="actor.send({ type: 'HELP.BACK' })" class="p-2 hover:bg-neutral-800 rounded"><ArrowLeft :size="18" /></button>
      <h1 class="font-semibold">Help</h1>
      <input aria-label="Search help" placeholder="Search help" :value="context.query" @input="search" class="ml-auto w-72 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" />
    </header>
    <div v-for="problem in context.catalog.problems" :key="problem.packId" role="alert" class="p-3 text-amber-300 text-sm">{{ problem.packId }}: {{ problem.message }}</div>
    <div class="flex flex-1 min-h-0">
      <aside class="w-72 shrink-0 border-r border-neutral-800 p-3 overflow-auto">
        <select aria-label="Filter help by feature" :value="featureFilter" @change="filterFeature" class="w-full mb-3 bg-neutral-800 rounded p-2 text-sm">
          <option value="">All features</option>
          <option v-for="feature in features" :key="feature.ref" :value="feature.ref">{{ feature.label }}</option>
        </select>
        <p v-if="context.loading" class="p-3 text-neutral-400">Loading help…</p>
        <p v-else-if="!articles.length" class="p-3 text-sm text-neutral-400">{{ context.query ? 'No articles match your search.' : 'No help articles are available for this selection.' }}</p>
        <section v-for="group in groups" :key="group.packId" class="mb-5">
          <h2 class="px-2 mb-2 text-xs text-neutral-400">{{ group.packName }}</h2>
          <button v-for="article in group.articles" :key="article.id" @click="openHelp({ packId: article.packId, articleId: article.id })" class="block w-full text-left rounded px-2 py-2 text-sm hover:bg-neutral-800" :class="selected?.packId === article.packId && selected?.id === article.id ? 'bg-neutral-800 text-white' : ''">{{ article.title }}</button>
        </section>
      </aside>
      <main class="flex-1 min-w-0 overflow-auto p-8">
        <article v-if="selected" class="max-w-3xl mx-auto">
          <p class="text-xs text-neutral-400 mb-2">{{ selected.packName }}</p>
          <h2 class="text-2xl font-semibold mb-6" data-testid="help-article-title">{{ selected.title }}</h2>
          <TiptapEditor mode="viewer" variant="chat" :modelValue="selected.body" :openViewerLink="articleLink" />
        </article>
        <p v-else-if="context.loading" class="text-neutral-400">Loading help…</p>
        <div v-else class="max-w-3xl mx-auto text-neutral-400">
          <h2 class="text-xl text-white mb-3">{{ context.target.articleId ? 'Article unavailable' : 'How can we help?' }}</h2>
          <p>{{ context.target.articleId ? 'The article is no longer available. Its pack may be disabled, removed or updated.' : 'Search the installed packs’ guides, or choose an article.' }}</p>
          <button v-if="context.target.articleId" @click="openHelp()" class="mt-4 underline">Browse all help</button>
        </div>
      </main>
    </div>
    <footer class="p-3 border-t border-neutral-800 text-center text-xs text-neutral-500">
      <button @click="openLink(DISCORD_URL)" class="underline mr-4">Join our Discord community</button>
      Developed in memory of <button @click="openLink(MEMORIAL_URL)" class="underline">Kathie Lovett Ulrich</button>
    </footer>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { ArrowLeft } from 'lucide-vue-next';
import { usePlugin, useShell, openHelp, openLink } from '@apackdev/sdk/fe';
import { splitRef } from '@apackdev/sdk/ids';
import { type HelpState } from '@apackdev/host/fe';
import TiptapEditor from '@apackdev/ui/components/tiptap/TiptapEditor';
import { DISCORD_URL, MEMORIAL_URL } from '@/views/settings/constants';
const actor: HelpState = usePlugin();
const plugins = useShell().plugins;
const context = useSelector(actor, s => s.context);
const selected = computed(() => context.value.catalog.articles.find(a => a.packId === context.value.target.packId && a.id === context.value.target.articleId));
const articles = computed(() => {
  const query = context.value.query.trim().toLocaleLowerCase();
  const target = context.value.target;
  return context.value.catalog.articles.filter(a => (!target.packId || a.packId === target.packId)
    && (!target.featureId || a.features?.includes(target.featureId))
    && (!query || `${a.title}\n${a.body}`.toLocaleLowerCase().includes(query)));
});
const groups = computed(() => [...new Set(articles.value.map(a => a.packId))].map(packId => ({ packId, packName: articles.value.find(a => a.packId === packId)!.packName, articles: articles.value.filter(a => a.packId === packId) })));
const features = computed(() => [...new Set(context.value.catalog.articles.flatMap(a => (a.features ?? []).map(f => `${a.packId}/${f}`)))].sort().map(ref => ({ ref, label: `${context.value.catalog.articles.find(a => a.packId === ref.split('/')[0])?.packName} · ${plugins.value.find(p => p.id === ref)?.label ?? ref.split('/')[1]}` })));
const featureFilter = computed(() => context.value.target.featureId ? `${context.value.target.packId}/${context.value.target.featureId}` : '');
function search(event: Event) { actor.send({ type: 'HELP.SEARCH', query: (event.target as HTMLInputElement).value }); }
function filterFeature(event: Event) { const ref = splitRef((event.target as HTMLSelectElement).value); openHelp(ref ?? {}); }
function articleLink(href: string) {
  const url = new URL(href, window.location.href);
  if (url.hostname === 'help.apack.invalid') {
    const [packId, ...id] = url.pathname.slice(1).split('/');
    openHelp({ packId: decodeURIComponent(packId), articleId: decodeURIComponent(id.join('/')) });
  } else if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') openLink(url.href);
}
</script>
