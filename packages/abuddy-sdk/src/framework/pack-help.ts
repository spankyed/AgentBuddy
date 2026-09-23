/**
 * The help entries registered packs declare (abuddy.json `help`). The app's Settings view lists them under Help,
 * so any pack can answer a question there — which is why they are a contribution like commands or blocks rather
 * than something the view reads from one pack's compiled seeds.
 *
 * A pack's entries are read the first time the list is, not at registration, so a pack whose help is compiled with
 * its seeds can read them then.
 */
import { boundHost } from '../runtime/host-runtime.ts';

/** One help entry: a question, its answer, and where it sits in the list */
export interface HelpEntry {
  id: string;
  question: string;
  answer: string;
}

/** Every registered pack's help entries, in the order the packs were first registered */
export function getPackHelp(): HelpEntry[] {
  return boundHost().packs.help();
}
