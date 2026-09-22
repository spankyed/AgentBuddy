// Before 0.3.15 every plugin and system ran under its bare feature id, and data written then names them that way, as
// the link blocks in messages do. These rewrite such a name onto this pack's ref, which the 0.3.15 migration applies
// to stored data. Code users wrote is left as they wrote it: a bare name there fails when the code runs, and the
// services' error names the ref it meant.
import { ref, type FeatureName } from '@/__generated__/ref';

/**
 * The features this pack had in 0.3.14, each a plugin and a system then under its bare id. A bare id among them is
 * this pack's; any other (another pack's) is left as it is rather than guessed at. A plugin since removed is in
 * `REMOVED_SINCE_0314`.
 */
const FEATURES_0314 = [
  'threads', 'code', 'notes', 'browser', 'library', 'flows', 'actions', 'prompts', 'brain', 'database', 'logs', 'settings',
] as const satisfies readonly FeatureName[];

/**
 * The plugins 0.3.14 had that no pack has any more. A link opening one would only throw when clicked, so it is
 * dropped; `calendar` was the built-in calendar, removed in 0.3.15.
 */
const REMOVED_SINCE_0314: readonly string[] = ['calendar'];

/** This pack's ref for a bare feature id it had in 0.3.14, or undefined for any other name */
export function refOf0314Feature(name: unknown): string | undefined {
  return typeof name === 'string' && (FEATURES_0314 as readonly string[]).includes(name) ? ref(name as FeatureName) : undefined;
}

/** A link as a message's link block stores it */
interface StoredLink { event?: { target?: unknown; data?: { type?: unknown; pluginId?: unknown } } }

/**
 * A link block's link, pointed at this pack's ref when it names one of this pack's plugins by bare id; `null` for a
 * link that no longer opens anything. `application` links sent the app shell an event, which a link can't do any
 * more: one that selected one of this pack's plugins opens it, and the rest are dropped, since clicking one would
 * only throw, as is a link to a plugin since removed (`REMOVED_SINCE_0314`). `external`, a ref, and a bare id this
 * pack never had stay as they are.
 */
function addressLink(link: StoredLink): StoredLink | null {
  const target = link?.event?.target;
  if (target === 'application') {
    const data = link.event?.data;
    const opens = data?.type === 'SELECT_PLUGIN' ? refOf0314Feature(data.pluginId) : undefined;
    return opens ? { ...link, event: { target: opens, data: undefined } } : null;
  }
  if (typeof target === 'string' && REMOVED_SINCE_0314.includes(target)) return null;
  const moved = refOf0314Feature(target);
  return moved ? { ...link, event: { ...link.event, target: moved } } : link;
}

/**
 * A message's blocks with each link block's links addressed (`addressLink`), and a link block left with no link
 * dropped. Whatever isn't a link block stays as it is; when nothing changes, `blocks` comes back as it was.
 */
export function addressLinkBlocks<T>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks;
  let changed = false;
  const next = blocks.flatMap((block: { type?: unknown; props?: { links?: unknown } }) => {
    if (block?.type !== 'link' || !Array.isArray(block.props?.links)) return [block];
    const links = (block.props.links as StoredLink[]).map(addressLink);
    if (links.every((link, i) => link === (block.props!.links as StoredLink[])[i])) return [block];
    changed = true;
    const kept = links.filter((link) => link !== null);
    return kept.length > 0 ? [{ ...block, props: { ...block.props, links: kept } }] : [];
  });
  return (changed ? next : blocks) as T;
}
