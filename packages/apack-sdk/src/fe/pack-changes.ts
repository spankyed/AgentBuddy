// When the registered pack frontends change, for frontend code that read one of the registries and has to
// read it again. The registries (`tiptapPluginRegistry`, `referenceRegistry`, `getDslTypes`, the app
// extension slots) are all pulls, and every pack's frontend — the app's own included — loads after the
// window is up, so a consumer that answers at setup holds that answer for as long as it lives.
import { boundFeHost } from '../runtime/fe-host.ts';

/**
 * Calls `listener` whenever a pack's frontend is registered or unregistered, and hands back the unsubscribe.
 *
 * It says only that something changed; what changed is read from the registries. The shell's own snapshot is
 * not a substitute: a pack that registers no plugin — one contributing only tiptap extensions, say — changes
 * nothing the shell publishes, so it would go unheard.
 *
 * Subscribe from inside a component's scope and dispose with it (`onScopeDispose`), never at module scope:
 * a listener registered on import outlives every window that imported it, and `@apackdev/ui`'s
 * `import-side-effects` spec fails one.
 */
export function onRegisteredPacksChanged(listener: () => void): () => void {
  return boundFeHost().packs.onRegisteredPacksChanged(listener);
}
