// External packs' frontends: which URL a pack's files are at, what counts as a registration one exports, and what
// unloading takes back. The two things only a window can do — import a module and add a stylesheet — arrive as
// `PackFrontendIO`, so the rules hold wherever this runs and the browser's part stays the renderer's.
import type { PackFERegistration, Plugin } from '@apack/sdk/fe';
import type { LoadedPackEntry } from '../../../packs/layout.ts';
import type { FePackRegistry } from '../../../fe/pack-store.ts';
import type { ShellPackFrontends } from '../../../fe/pack-frontends.ts';

/** A window's stylesheets for a pack: added once per href, and taken out together when the pack goes */
export interface PackFrontendStyles {
  /** Adds the stylesheet at `href` for `packId`, unless it is already there. Resolves when it has loaded or failed. */
  add(packId: string, href: string): Promise<void>;
  /** Removes every stylesheet added for `packId` */
  remove(packId: string): void;
}

/**
 * A pack's frontend served from its source on this disk, by pack id. A dev server fills it (the renderer's
 * `virtual:dev-pack-frontends`); a built app's is empty.
 *
 * It is preferred over `pack://` when the pack is in it, because its modules are in the dev server's own
 * graph: that is what lets a `.vue` edit patch the component rather than reload the whole page. It is keyed
 * by pack id and asks nothing else about the pack — a pack is in it because its source is here.
 */
export type DevPackFrontends = Record<string, () => Promise<{ default?: unknown }>>;

/** What loading a pack's frontend needs from the window it loads into */
export interface PackFrontendIO {
  /** Imports a module by URL, as the window's dynamic `import()` does */
  importModule(url: string): Promise<{ default?: unknown }>;
  styles: PackFrontendStyles;
  /** The packs this window serves from source, preferred over `pack://`; none in a built app */
  devFrontends?: DevPackFrontends;
}

/**
 * What a default export has to declare one of to count as a registration. Tied to the type, so a renamed field is
 * a build failure rather than a warning that stops firing.
 */
const REGISTRATION_KEYS = [
  'features', 'steps', 'artifacts', 'blocks', 'tiptapPlugins', 'appExtensions', 'dslTypes',
] as const satisfies readonly (keyof PackFERegistration)[];

/** A pack file's URL, carrying the frontend's revision: a browser caches a module or stylesheet by its URL */
function packFileUrl(packBaseUrl: string, file: string, revision?: string): string {
  return `${packBaseUrl}/${file}${revision ? `?v=${revision}` : ''}`;
}

/**
 * Imports a pack's FE entry: its registration, or null when it exports none. Throws when the import fails.
 *
 * `source` is a loader for the pack's own sources when this window serves them, in which case `url` names
 * nothing that is fetched and only labels the failure.
 */
export async function loadPackFEEntry(
  io: PackFrontendIO,
  entry: string,
  packBaseUrl: string,
  revision?: string,
  source?: () => Promise<{ default?: unknown }>,
): Promise<PackFERegistration | null> {
  const url = source ? `${packBaseUrl} (from source)` : packFileUrl(packBaseUrl, entry, revision);
  let mod: { default?: unknown };
  try {
    mod = source ? await source() : await io.importModule(packFileUrl(packBaseUrl, entry, revision));
  } catch (err) {
    // The pack:// URL names the pack; the E2E fixture matches on it
    console.error(`[pack-loader] Failed to load FE entry ${url}:`, err);
    throw err;
  }
  const registration = mod.default;
  if (!registration || typeof registration !== 'object') {
    console.warn(`[pack-loader] FE entry ${url} registers nothing: ${registration === undefined
      ? 'it has no default export — export the registration as default'
      : 'its default export is not a registration'}.`);
    return null;
  }
  // A default export declaring registration fields, even empty ones, is deliberate: the generated entry of a pack
  // without FE extensions is { features: {} }
  if (!REGISTRATION_KEYS.some((key) => key in registration)) {
    console.warn(`[pack-loader] FE entry ${url} registers nothing (no ${REGISTRATION_KEYS.join('/')}): its default export declares none of them.`);
  }
  return registration as PackFERegistration;
}

/**
 * The shell's pack frontends over one window: `load` adds a pack's styles and imports its entry, registering what it
 * contributes and answering with the plugins it added (null for a pack with no frontend code, whose systems the bus
 * has told already); `unload` undoes both, for a pack deactivated and for a load that finished after it was.
 */
export function createPackFrontends(io: PackFrontendIO, packs: FePackRegistry): ShellPackFrontends {
  return {
    async load(pack: LoadedPackEntry): Promise<Plugin[] | null> {
      const packBaseUrl = `pack://${pack.id}`;
      // Served from source, the pack's styles come through its own module graph with the rest of it
      const source = io.devFrontends?.[pack.id];
      if (pack.feStyles && !source) await io.styles.add(pack.id, packFileUrl(packBaseUrl, pack.feStyles, pack.feRevision));
      // A pack served from source has a frontend whatever its built manifest says, since the map holds only
      // packs whose codegen wrote one
      if (!pack.feEntry && !source) return null;

      const registration = await loadPackFEEntry(io, pack.feEntry ?? '', packBaseUrl, pack.feRevision, source);
      if (!registration) return [];
      return packs.registerPackFE(registration);
    },

    unload(packId: string): void {
      packs.unregisterPackFE(packId);
      io.styles.remove(packId);
    },
  };
}
