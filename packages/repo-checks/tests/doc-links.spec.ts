import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * Every relative link between the repo's own documents resolves.
 *
 * The recurring cause is archiving: a goal doc in `docs/goals/` links to a finished one as
 * `../archive/goals/goal-x.md`, and the day it is archived itself that becomes
 * `docs/archive/archive/goals/goal-x.md`. Both goals archived on 2026-09-26 broke four links that way, and
 * `docs/goals/README.md` says to fix links *to* a moved file without mentioning the ones inside it. Nothing
 * noticed, because a dead link in a markdown file fails nothing.
 *
 * The docs are where this repo keeps the reasoning behind decisions — the chain's tiers, the seams, what each
 * measurement disproved — and a doc reached by following a link from another is how any of that is found. A
 * link that 404s costs the reader the chain of reasoning, silently.
 */

/** A link inside an inline code span is sample text: `docs/goals/README.md` shows link *templates* that way */
const withoutCodeSpans = (markdown: string): string => markdown.replace(/`[^`\n]*`/g, '').replace(/```[\s\S]*?```/g, '');

/**
 * Every link target, so the filter below decides what is relative rather than the pattern.
 *
 * The first version matched only `./` and `../`, which made a sibling link — `[x](goal-x.md)`, exactly what
 * archiving a doc turns its links into — invisible to this check. A mutation caught it: breaking such a link
 * left the spec green.
 */
const LINK = /\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/g;

/** A link this repo can resolve: not a URL, not an anchor, not root-absolute (which no doc here uses) */
const isRelative = (target: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('#') && !target.startsWith('/');

/**
 * The markdown written for a reader of this repo — not content seeded into the app.
 *
 * A pack's seed sources and the fixture packs' are markdown too, and their links mean something else: a
 * library document's `media/pic.png` is resolved by the media store against the seeded tree, not by this
 * checkout's directory layout, so three of them read as dead here and are not.
 */
const docs = (): string[] =>
  execFileSync('git', ['ls-files', '*.md'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter(Boolean)
    .filter((file) => file.startsWith('docs/') || !file.includes('/') || /(^|\/)(CLAUDE|README)\.md$/.test(file))
    .filter((file) => !file.includes('/fixtures/') && !file.includes('/seeds/'));

describe("a link between the repo's documents resolves", () => {
  const broken = (): string[] => docs().flatMap((file) => {
    const text = withoutCodeSpans(fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'));
    return [...text.matchAll(LINK)]
      .map(([, target]) => target.replace(/#.*$/, ''))
      .filter((target) => target !== '' && isRelative(target))
      .filter((target) => !fs.existsSync(path.resolve(REPO_ROOT, path.dirname(file), target)))
      .map((target) => `${file} -> ${target}`);
  });

  it('there are links to check, so this is not vacuous', () => {
    expect(docs().length).toBeGreaterThan(20);
  });

  it('leaves none of them dead', () => {
    expect(broken(), 'a document links to a path that is not there. The usual cause is a doc that moved: '
      + 'archiving one turns its own `../archive/goals/x.md` into `archive/archive/goals/x.md`, and moving '
      + 'any file leaves the links pointing at it behind').toEqual([]);
  });
});
