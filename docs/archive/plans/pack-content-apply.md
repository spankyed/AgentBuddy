# A pack's content is applied, and the user may come to own it

> **Done and closed** (branch `AS/pack-content-apply`). Phase 1 `2a638c8b5`/`b980a2835`/`02ebfc1d4`,
> Phase 2 `4ea7b2c67` with its review fixes in `c126260ec`, Phase 3 `431c3b036`, Phase 4 after it. The text
> below is the plan as written; five things the work found are corrections to it:
>
> - **`find` was not dropped from a content writer** (Decision 11's list). The applied content cannot answer
>   identity matching: a writer still has to find the user's entity by name before anything can be said about
>   whose it is, so `find` and `container` both stayed on `ContentWriter`.
> - **`conflicts` and `flagged` became one container**, `ApplyRecord.offers`, with a `kind` of `update` or
>   `removed`. They are reached by the same rule and differ only in what resolving one means, so two maps
>   were two accounts of one fact. They stayed on the record rather than being copied onto the result, for
>   the same reason.
> - **Two destructive bugs the first Phase 2 cut had**, both found in review and fixed in `c126260ec`: a flow
>   that failed validation and an item whose writer hook threw each left their keys undeclared, so the
>   removal pass read them as content the pack had dropped and deleted the user's data. Both writers now
>   declare every key the compiled file holds *before* writing anything, which is why
>   `ApplyRecord.defined` is derived from the content and never from the walk.
> - **Removal is per entry key**, which Decision 9 does not say: each writer diffs only the keys under its own
>   prefix, so content whose *whole entry* a pack stops declaring has no writer left to remove it, and a
>   renamed entry key orphans what the old one wrote.
> - **"Merge" — the third choice of Decision 8 — is not built, and could not be as specified.** It is
>   described as opening the editor "with both", and Decision 3 keeps hashes rather than values, so what the
>   pack previously shipped cannot be rendered at all. What is left of it, opening the user's own item to
>   edit by hand, needs a route from an entity type to the plugin that edits it, which no pack declares: the
>   manifest has no such key and nothing in the app maps one. So the offer has two writing choices (take the
>   new version, keep mine) plus, per Decision 5, **Reset to factory** on an item the user kept their own
>   version of. A `content.sources` key naming the plugin that edits an entry's items is the change that
>   would make Merge possible, and it is a manifest addition rather than a UI one.
>
> One thing the plan asks for that is only partly available: **Reset to factory is offered on the items the
> app knows the user kept** — the entries carrying a `dismissed` hash — rather than on every item they have
> ever edited. A forked entry's edit is recorded nowhere by design, so there is no list of those to draw.

Compiled 2026-10-08 on `master`, at `46de706f2`. **The design is settled; the phases are not started.**
Phase 1 is deliberately read-only — it writes the new applied content and reads nothing from it — so the model is
validated against real content before anything depends on it.

## Context

A pack ships content into the user's database: flows, actions, prompts, notes, library documents. The user
then edits it, deletes it, and creates their own beside it, and the pack ships a new version. So the real
operation is a **three-way merge**: what we applied last, what the pack declares now, and what is in the
database. Every per-entity decision in `createFormatApplier` is answering one of merge's questions.

**Nothing stores what we applied last.** Five partial fingerprints of it answer one question each:

| The question | What answers it | Where |
|---|---|---|
| Did the pack's content change at all? | `appliedContent` — a hash of the compiled files | `AppState`, per pack |
| Which entity is this item's? | `contentKey` | on the entity (`applier.ts:29`) |
| Is this entity still ours to update? | `seededFields` — **one** hash over all the fields together | on the entity (`applier.ts:27`, `:91`, `:96`) |
| …for a flow? | `seededGraph` — the same idea, a second shape | on the entity (`flow-applier.ts:24`, `:29`, `:42`) |
| Did the user delete it? | the trashed entity's own `contentKey`, **or** `appliedContent` | on the entity **and** `AppState` |

Five facts about that table:

- **`seededFields` is one digest over every field.** Edit one field of a seeded flow and `holdsSeededValues`
  is false for the whole item, permanently and silently: the entity is skipped as "edited" by every future
  version. For a flow that is thirty entities frozen by one edit.
- **The deletion rule needed two mechanisms** (`46de706f2`, `161891e64`) because a trashed entity is its own
  evidence while a destroyed one leaves nothing. They have different reach: the trashed-entity branch works for
  any caller, the remembered keys only where the app threads them in.
- **Notes and library track no edges at all.** `seededFields` covers attributes; the `contains` link the
  applier writes (`applier.ts:205`) and a note's `references` edges are remembered nowhere, so moving a seeded note
  is invisible. Flows track edges because they were the first shape where it mattered.
- **`clearedFields` is the tell.** The applier already reasons per field: `seededFields` keeps the field
  *names* it wrote, so an update can work out which to reset because the incoming item no longer sets them.
  The names are there and the values are collapsed into one digest — so per-field reasoning is already
  wanted, already half-built, and stops exactly where the verdict is reached.
- **Four concepts have no name**, which is why none of them can be surfaced: *the user edited this* (an
  unlabelled skip branch), *both sides changed* (conflict), *we stopped shipping this* (nothing reads it),
  *who last wrote this part* (nothing).

**One word covers two operations.** `importCompiledContent` (`utils/apply.ts:55`) is called by boot seeding
(`packs/runtime/apply.ts`) and by the user asking for a pack's data back
(`features/packs/be/system.ts:118`). They differ in every way that matters:

| | the user asks for a pack's content | boot |
|---|---|---|
| Who starts it | a person, in Settings | the app |
| Input | the compiled content | the content **plus** what we applied last |
| May overwrite the user's work | yes — that is the request | never |
| An absent entity means | create it | maybe the user deleted it |
| On failure | tell the user | record it and retry when something changes |

The difference is expressed as an optional parameter. That optionality *is* the two operations hiding in one
function, and it is why `content.sourcesPolicy` ("do not import this at boot") was ever expressible. The second
one has a standard name — **apply**, the declarative convergence of live state toward declared state
(`kubectl apply`, `terraform apply`, Ansible, Chef) — and it brings the vocabulary this subsystem is
currently inventing.

**The noun has already cost a design.** `skipAfterOnboarding: ['notes']` existed because "seed" means
first-run data, so "the welcome note keeps coming back" was reasoned as "stop seeding after onboarding"; the
actual cause was a lookup that could not see a deleted entity (`goal-boot-seed-imports-rows.md`). The repo's
own convention — *seed is a noun, `import` is the verb*, checked by `import-is-the-verb.spec.ts` — fixed the
noun/verb confusion and left the connotation.

**`faqs` contradicts the stated rule.** `goal-generic-seed-compiler.md` Decision 9 put it in `content.sources`
with no entity, compiled but never imported; `goal-boot-seed-imports-rows.md` then established that
`content.sources` holds only entries that import entities. Both are deliberate and they disagree.

## Decisions

Final. Two words carry the rest. An **item** is what one content key names — the unit the user experiences
as "a note", "an action", "a flow" — and it may be one entity or several: a note is one, a flow is its own
entity plus a node entity per step and the wiring between them. A **part** is one addressable piece of an
item: a field, or an edge set. "Entity" is the data layer's word for a thing in the database
(`destroyEntity`, `updateEntity`); this doc does not say "row", since EARS has no tables for one to sit in.

1. **The applied content is one entity per pack, in the database.** A host-declared entity type beside `AppState` and
   `Settings` (`HOST_ENTITY_TYPES`), one entity per pack, written at the end of each apply — two attributes
   rather than one document, so the gate can read `revision` without deserialising every item:

   ```
   AppliedContent-<packId>
     revision: <contentRevision of the compiled dir this came from>
     items: { "<contentKey>": { entityType, identity, parentKey?, contentHash, parts: { <path>: <hash> } } }
   ```

   It must be in the primary partition, not a file beside `installed-packs.json`: it describes user data, so
   a backup has to carry it. Restore a backup without it and every entity reads as either user-created or
   deleted, which would make the merge destroy exactly the data the restore was for. `exportDatabase` copies
   that partition wholesale, so an entity type gets this for free.

   `revision` *is* what `appliedContent` holds today — `contentRevision` over the compiled directory,
   file names and bytes — rather than a second number meaning almost the same thing, and `items[k].contentHash`
   adds the granularity it cannot: an edit to one note stops re-walking the pack's other items — 85 of
   them as this pack ships today, a figure a spec derives from the compiled index rather than holding.

   **An item's parts are what we last wrote to that entity — not what the last version declared**, and the two
   differ for every item an apply skipped. A conflicted item, a user-owned one, an edited item the pack
   removed: the entity still holds what we wrote *before*, so that is what its entry keeps. Recording the
   incoming content for an entity we did not write would make that item read as drifted from then on, and the
   conflict would be lost. So `revision` is the version we last applied *from* and nothing more than a gate,
   while the items may each lag it. This is the one thing `seededFields` has right today — it records what
   the applier wrote — and the move is off the entity into one place, not to a different fact.

   **A failed apply records what it wrote**, which is a correction to "saved at the end of each apply that
   finished without errors" below. A run that imported fifty items and then failed on one has changed fifty
   entities, and `appliedContent` moves whether it failed or not — so nothing re-imports them until the
   content changes again, and leaving them out of the record would make a later apply read all fifty as the
   user's. What a failure does not move is `appliedContent`: its set of defined keys is incomplete, so recording
   it would read as the pack having dropped every key the run never reached.

   **So the applied content is updated, not recomputed.** Each apply starts from the existing one and makes four
   kinds of change: an entry is **replaced** for every item it wrote; **kept as it was** for every item it
   skipped; **dropped** for every key the new content no longer has, once the removal rule has acted on it
   (an edited item the pack removed keeps its entry, with its flag, until the user resolves it); and
   **added** for every item it created. It is still a snapshot rather than a log — nothing accumulates
   except unresolved flags — but it is the previous snapshot moved forward rather than one taken afresh
   from the new content.

   **It follows that whoever writes an entity updates that item's entry**, which includes
   `importPackSeeds`: an import that puts content back has written entities, and an import that recorded nothing
   would leave the next apply comparing new entities against older parts and calling the difference the user's.

   `identity` is in the entry for one job and it is not adoption: an entity the user created with the same name
   is matched so that an apply does not add a copy beside it, and is then left alone as theirs — which is
   what `findByIdentity` plus the untracked-entity outcome do today. **An entity we did not write never becomes
   ours.**

2. **Parts are path-addressed, and one scheme covers entities, trees and graphs.** `label`,
   `node:Ask.prompt`, `edges`, `parent`. `seededFields`' field list and `seededGraph`'s three lists
   (`flowFields`, `nodeFields`, `relKinds`) are both part-id schemes written by hand; one map replaces both,
   and a part that is an edge set is a part like any other — which is how the untracked `contains` and
   `references` edges start being tracked. The precedent is Kubernetes' `managedFields`, which is a flat set
   of field paths with no type per shape.

   **A flow's nodes are parts of the flow, not items of their own**, and the line is Decision 4: an item is
   a unit of writing, so a node as an item would make a flow writable node by node. The test is whether the
   user experiences it as a separate thing — a sub-note or a document in a collection does, and is its own
   item with a `parentKey`; a node does not, and is a path inside the flow's. A flow is one item however
   many entities it is made of.

   Two constraints the current design discovered and this one inherits. **Only the parts we wrote are
   recorded** — never everything on the entity, or an attribute the user or another pack adds reads as our
   edit (what `seededFields`' field list and `ROW_KEYS` are for). And **node part paths rely on node ids
   being derived from the flow's name at compile time**; that determinism is what lets one run's parts line
   up with the next's, and it is why `collidingOwner` exists.

   **How coarse a part should be, worked on a flow — because this is the part most likely to be built
   bigger than it needs to be.** The merge needs exactly one bit per item: did the user touch it. One hash
   answers that. Parts are finer only so the flag can say *where*, so the question is not "how do we diff
   nested fields" but "what list is worth showing someone". For `Codex`, which compiles to one Flow entity,
   a Node entity per step across its 13 tracks, `CONTAINS` to each node and `TRANSITIONS_TO` for the wiring:

   | Part | Hashes |
   |---|---|
   | `fields` | the Flow entity's own values, as one unit |
   | `node:<id>` | that node's stored values as one unit — a step's nested config included, hashed whole |
   | `edges` | every edge, sorted, with its `info`, so a rewired branch (`sourceHandle: branch-0`) counts |

   That is 32 parts for a 30-step flow, and **nothing goes inside a step's config**: edit an action step's
   parameters and the flag reads *"step 'reconcile' changed"*, which is what someone deciding whether to
   take a new version needs. Finer would read *"step 'reconcile' → params → retries changed"* and help
   nobody. A note is the same scheme with fewer parts (`title`, `content`, `parent`, `references`), where
   field-level happens to be the readable granularity.

   **This is a smaller change than it sounds**: `seededGraph` already walks and records exactly that scope
   — `flowFields`, `nodeFields` keyed by node id, `relKinds` — and then collapses it into one digest. The
   change is to keep one hash per node instead of one for the lot. Same walk, same scope, more outputs.

   **Subflows and actions are references, not structure.** A subflow step is a node with a `flowRef` field
   and an action step has an `action` field holding a label, so the flow or action referred to is its own
   item and the reference is a field value inside this one. Nothing crosses an item boundary, which is why
   one flow's nodes can never be read as another's.

3. **A part hash, not a part value.** Three-way merge needs "did this move, on either side"; the incoming
   value is in hand. Storing values would make the applied content a second copy of the content and invite it to
   become a content store. What is given up is rendering what we previously shipped, which is a debugging
   convenience.

4. **The item is the unit of conflict and of writing; the part is the unit of detection and display.**
   No per-field auto-merge, ever. Coupling between parts is invisible to us: an action's `inputs` describes
   the parameters its `actionFn` reads, so writing our `inputs` onto a body the user rewrote produces an
   action neither party wrote, which fails at runtime in a way no test of ours covers.

   **The whole of resolution is three cases per item:**

   1. **Every part matches what we wrote** → still ours → write the new version wholesale (for a flow, the
      delete-and-reimport the flow writer already does). Nearly every item, and today's behaviour.
   2. **Any part differs** → the user's → write nothing. Where the entry says `offer`, flag it with the
      names of the differing parts.
   3. **Not in the applied content** → create it when nothing is there; leave an entity with that name
      alone as theirs (Decision 1's `identity`).

   Three things it deliberately does not do, each a plausible next step that earns nothing. **No per-part
   writing** — nodes and wiring are coupled, since a new node arrives with the wiring that expects it.
   **No structural diff**: we never work out that a node was renamed, moved or split, and the one difference
   computed anywhere is a set difference over part names. **No text merge** — a hybrid is written only in
   the editor the user chose to open, which is the one place a body and its schema can be reconciled by
   someone who knows what they mean.

5. **`apply` and `import` are two operations with two entry points.** `applyPack` converges the database
   toward what the pack declares, carries the applied content, and never overwrites the user. `importPackSeeds`
   is the user asking for content to be put back: no applied content, modes as today, overwriting is the
   request. A spec asserts the applied content is read on the apply path and nowhere on the import path, so
   the distinction is structural rather than remembered.

   **Three user-visible actions are one call, and there are not three paths.** "Restore this pack's content"
   selects everything; "take the new version" on an offer and "reset to factory" each select one item and
   overwrite whatever is there — the same request, differing only in what prompted it. So
   `importPackSeeds({ select: [contentKey], force: true })` serves both, and the selection already exists
   (`ContentSelection` names top-level items today). What is missing is `force`, because every mode now skips
   an edited item and `wipe-and-replace` is far too blunt for one of them.

   That leaves **one place in the codebase where the user's work is overwritten**: it takes a selection and
   an explicit flag, and it is only ever reached from something the user clicked. `applyPack` never passes
   `force`, which the structural spec above holds as well — a stronger guarantee than today, where the
   overwrite rules are spread through both writers' mode branches. `kubectl apply --force-conflicts` and
   `git checkout --theirs` are the same shape: the dangerous act exists, is named, and is never the default.

6. **The route settings took is not open to this content.** Settings never merge: the entity holds only the
   user's changes and the pack's defaults compose underneath at read time. Content is entities the engine runs
   and the editor opens, with no composition step to hide a layer in, so a merge has to happen somewhere —
   which is what the rest of these decisions are about.

7. **Fork or offer, declared per content entry, defaulting to fork.** The line is whether editing it meant
   adoption or customisation. A note or a library document is the user's writing — **fork**: theirs forever,
   never updated, no badge on their own prose. A flow, action or prompt is ours, customised — **offer**: they
   still want our bug fixes. One key per entry (`onUserEdit: 'fork' | 'offer'`), and the default is the
   conservative one, so the dangerous option is the one someone has to type.

8. **An offer is resolved by the user, in the app.** On an item with an offer: *"A newer version of this
   action ships with 0.4.0. You've changed it."*

   **Two panes, not three — yours against theirs.** Decision 3 keeps hashes, so what we previously shipped
   cannot be rendered; what the hashes *can* do is label every part, which is the half that matters. For the
   action above: `actionFn` changed on both sides (a conflict), `inputs` changed on theirs and not on yours,
   `label` and `category` unchanged. Each label is two hash comparisons — live against applied, incoming
   against applied — and needs no stored text.

   Three choices and no fourth:

   - **Take the new version**, which replaces your changes, and the button says so: there is nothing stored
     to restore from.
   - **Keep mine**, which stores `dismissed: <the contentHash we offered>` on the item's entry. Keyed to the
     item rather than to a pack version, so a release touching nothing here is silent, and the offer returns
     by itself when the item changes again — including a version that arrives before the user resolved the
     last one.
   - **Merge**, which opens the editor with both and is the only path that writes a hybrid, because only the
     user knows that the body and the schema have to agree.

   Today's equivalent is a silent permanent freeze; this makes it a decision someone took.

9. **Content a pack removed is removed for the user — unless they edited it, which flags it.** The same
   rule as everywhere else here: ours to act on while it is still ours, theirs to decide once they have
   touched it.

   **What was removed needs no declaration from the pack.** The applied content holds an entry per item we
   have written, so the removals are its keys that the new content does not have. A pack declaring its own removals would be
   more work for pack authors and a second account of the same fact.

   Three clauses make that correct, and none of them is a threshold:

   - **A content key whose compiled file did not load contributes no removals.** Both writers return early
     and log "file not found, skipping" for a missing file, and `loadJSON` does the same for one that fails
     to parse — so that key said nothing, and you cannot diff against a list you failed to read.
   - **Removal follows the parent chain.** A removed note takes its sub-notes with it; an edited child is
     flagged rather than deleted, and keeping it keeps its parent.
   - **A container holding entities we do not own is not deleted** — the shared library folder another pack's
     documents are filed under. Removing the folder would take their content with it, and it is not ours to
     remove.

   An edited item the pack removed is flagged through the same mechanism as a conflict, with its own
   sentence: *"this is no longer part of the pack."* The choices are keep it (it becomes plainly yours) or
   delete it.

10. **`content` replaces `seed` as the noun, and ownership gets named rather than implied.** Three jobs,
   three words:

   | Job | Word |
   |---|---|
   | the manifest section and the pack's source tree | `content` — `content.sources`, `content.formats`, `content.writers`, `src/content/` |
   | who last wrote a part, and so whose an item is | `owner: 'pack' \| 'user'` |
   | the UI action | "Restore this pack's content", "Reset to factory" |

   `content` is clean where it is used: 224 TypeScript files mention it, but a manifest holds the word only
   as a *field name in data* (`notes.fields.content`), and a button label has no collisions at all.
   `owner: 'pack' | 'user'` names the two actual parties, needs no glossary, and is already how this repo's
   prose talks ("user-owned", "another pack's container", "the user has taken ownership") — it simply never
   became a field. Rejected, with the reason: `stock` (free, but a word to learn), `upstream`/`local`
   (`local` is in 81 files; "upstream" needs a referent an entity hasn't got), `pristine` (names a state, not an
   owner), `declared` (59 files), `standard`/`original`/`provided` (16/26/38 files), `factory` as an
   identifier (collides with factory functions — keep it for the button, where it is the best word of the
   lot), and a different noun per kind (`presets` for flows, `templates` for notes: two pipelines in
   everyone's head for a distinction Decision 7 already carries).

   **Two more words go, and one of them is not a rename.** A thing in the database is an **entity** — the
   data layer's own word (`destroyEntity`, `updateEntity`, `entityType`) — and "row" leaves, since EARS has
   no tables for a row to be in. A piece of a pack's compiled content is an **item** (`ContentItem` →
   `ContentItem`, and `record` → `item` through the writers' locals), which frees "record" to be only a
   verb: today it names both the incoming content and the memory of what we wrote, which are opposite ends
   of the same pipeline. The memory is **the applied content**. And **"aggregate" is not introduced at all**
   — an item is already the unit of writing, so the word would be a second name for it.

   It is ~180 `record` locals, 37 `ContentItem`, 74 `row` locals and `CompiledRows`, almost all inside the
   files Phase 3 is already rewriting, and no TypeScript `Record<…>` is touched. Bundled there it is nearly
   free; on its own it is churn.

11. **The merge vocabulary is borrowed, not invented.** `applied` / `incoming` / `live` for the three
    inputs — git's *base*/*theirs*/*ours* invert depending on who "we" are, and this subsystem has had that
    confusion already. `drift` (live ≠ applied), `conflict` (both moved), `revision` (what `contentRevision` returns, renamed `contentRevision`). Each is borrowed:
    `last-applied-configuration` and field-path ownership from Kubernetes' server-side apply, `drift` from
    Terraform, and `conflict` and the three-way inputs from git. The one
    term that goes rather than being renamed is `contentHash`, where `source` means "the authored file" while
    everywhere else in this repo it means a logger or event source.

12. **`faqs` moves to `content.artifacts`, in this plan.** A compiled artefact the pack reads back itself is
    not content applied to a database, and the contradiction between `goal-generic-seed-compiler.md`'s
    Decision 9 and "`content.sources` holds only entries that import entities" is closed by giving it a key of its
    own: compiled like any other entry, no applier generated, never touching the database. Two lines of
    schema.

    **It does not wait for `goal-manifest-redesign.md`.** Deferring the key there was how the contradiction
    would have survived Phase 3 and possibly indefinitely; that plan can absorb this key with the rest of
    the manifest if it lands. A build output belongs beside `steps.build` and `seed-compilers.mjs`, which is
    where it was heading anyway.

13. **Renames that are deletions.** `seededFields`, `seededGraph`, `appliedContent`, `appliedContent`,
    `markSeededRowUnedited`, `holdsSeededValues`, `holdsSeededGraph`, `stampSeededFields`,
    `stampSeededGraph`, `hashGraph`, `defineSeedKey`, `removedByUser` and the two deletion branches all go.
    Two roles, two words, neither of them "applier": a **writer** knows how to write one entity type
    (`ContentWriter` minus `find`, which the applied content answers — create/update/delete, with `container`
    moving to the format config where it belongs; the manifest key is `content.writers`), and an **applier**
    converges one content key (`ContentApplier` → `ContentApplier`, and the two implementations named for what drives
    them: `createFormatApplier` → `createFormatApplier`, since a `content.formats` entry is what describes its
    content, beside `createFlowApplier`. Neither reads as "the" one, and neither carries `record`, which is
    leaving. The registration key is `appliers`). `ApplyResult`
    → `ApplyResult`/`ImportResult` with `conflicts` and `removed` beside the counts, since it already carries
    `errors` and is not counts. Three smaller ones from the same audit: `applyPacks` → `applyPacks`, which
    also stops a verb being named after the noun and closes the hole the current guard cannot see (it reads
    return types, and `applyPacks` returns failures); `ContentSelection` → `ContentSelection = 'all' |
    ReadonlySet<string>`, dropping `true` as a magic value in a type named "Set"; and `failedAgainst` →
    `failedAgainst`, which says what it holds.

14. **What is deliberately not renamed**, so the churn is a decision rather than an oversight: `contentKey`
    becomes `contentKey` only because `seed` leaves the vocabulary — the identity itself is good and stays
    the join key; `seeds.json`/`SEED_INDEX_FILE` (the constant already says index, and the file name is
    read by built packs on disk); `SeedIndex` and `content.formats` are correct nouns and need only the noun swap
    (`ContentItem` does not — it becomes `ContentItem`, per Decision 10); `previewPackContent` and `seed-parity:*` keep their shape. And `import` stays the
    user-facing verb: "Restore this pack's content" is the label, but the operation underneath it is an
    import and should say so.

## Phases

### Phase 1 — write the applied content, read nothing from it

- The entity type, in `HOST_ENTITY_TYPES`, with `appliedContent` accessors beside `appState`.
- Both writers (`createFormatApplier`, `createFlowApplier`) report the parts they wrote, through the context, as
  `defineSeedKey` reports keys today.
- `applyPacks` writes the applied content after a successful run, beside what it writes now. Nothing reads it.
- **Three homes, not one spec**, because two of the five answers are out of any single suite's reach:
  `holdsSeededValues`/`holdsSeededGraph` are module-private and callable from no spec, and `appliedContent`
  is written by `applyPacks`, which a pack suite never runs (and may not import). So: the derivation rules over
  a synthetic fixture in `abuddy-sdk/tests/content/`, the per-item and per-part agreement over real content in
  `default-setup/tests/content/`, and `revision` against `appliedContent` in host's `loader.spec.ts`.
- **The agreement with the stored digests is behavioural, not arithmetic.** `seededFields.hash` is one digest
  over the whole value array, so it is not derivable from per-part hashes — and a spec that re-hashes the
  values itself to compare restates the writer and fails on any behaviour-preserving rewrite. What the specs
  assert instead: the part paths equal `seededFields.fields` and `seededGraph.nodeFields`' keys (two walks
  agreeing), every part agrees with the database the same run wrote, and an edit to one field moves exactly
  that part where the stored digest can only say something moved.

**Done when:** that agreement spec passes for every seeded key in default-setup; `seed-parity` goldens are
unmoved; `npm run spec -- applier flow-applier loader` and the pack's seed suite pass. Mutation: dropping one
part from the applied content fails the agreement spec for that item, and dropping the `edges` part fails it for
a flow. Cheap and reversible — if the model and the hashes disagree anywhere, that is the finding, and no
behaviour depends on it yet.

### Phase 2 — read from it, delete the five

After Phase 1. The merge moves into one function over (applied, incoming, live) returning a per-item
outcome — Decision 4's three cases with Decision 9's two removal verdicts, enumerated: `create` and
`user-owned` (nothing of ours is there), `fast-forward` (still ours), `conflict` (the user's), `removed` and
`absent-by-deletion` (the content dropped it, or the user did). There is one model, not two. `createFormatApplier`
and `createFlowApplier` become thin adapters that know only how to read and write their entity types.

- `owner` is derived per part, and per item for the write decision (Decision 4).
- Removals are part of the merge, not a separate pass (Decision 9): an unedited item the new content no
  longer has is deleted here, and an edited one is recorded as flagged, which stays invisible until Phase 4
  draws it.
- The three import modes stop being branches threaded through both writers and become predicates over the
  one merge: `keep-existing` skips an item that exists, `replace-on-collision` is the default, and
  `wipe-and-replace` removes the entry's entities first. The last stays a step of its own rather than a
  predicate — it is a destructive act before the merge, not a verdict within it.
- The deletion question becomes one case: in the applied content, no live entity (absent **or** trashed).
- Delete what Decision 13 names, including the entity attributes. **No migration**: nothing has this data but
  development dirs, so they are reset (`appData.reset()`, or `abuddy db reset`) and the first apply writes
  the applied content. A translation from the old attributes would be a subsystem written for nobody.
- **Surface the conflicts here, before any UI exists.** The moment the merge runs, a conflict is computable,
  and saying so costs a line: one summary per apply in the log and an entry in the Logs plugin — *"3 items
  have your edits and a newer version is available: flow 'Codex', action 'CDX: Start Server'…"*. This is the
  whole point of the plan (a silent permanent freeze becomes something you can see) for a day's work, it
  gives real feedback on whether the detection is right before anyone builds a diff view, and if
  Phases 3 and 4 slip the benefit has already landed.

**Done when:** `grep -rn "seededFields\|seededGraph\|appliedContent\|markSeededRowUnedited"` finds nothing
outside `docs/archive/`; the five questions are answered by one place; `seed-parity` goldens unmoved; a
spec covers an apply against a database holding entities the applied content does not know (the first apply,
and the same path as a user's entity that matches a content item's identity); the conflict summary appears in
the log for a database with an edited item; `npm run chain` passes.

**One function deserves one table.** The merge becomes the single place every verdict is reached, so its
spec is a case matrix in one file — the resolution outcomes against the content shapes (one entity, a tree
child, a graph) and the modes — rather than cases scattered by the shape they happen to use. A new outcome
is then a row. The `seed-parity` goldens stay beside it as the regression gate: they are what proves 144 real
items still land identically, which no table of constructed cases can.

**After this phase the subsystem is sound and the freeze is visible**, so Phases 3 and 4 are each
independently valuable and independently schedulable. Neither is a reason for the first two to wait, and
saying so here is meant to stop the plan being read as a sequence that has to complete.

### Phase 3 — two operations, two names

After Phase 2, and landable before Phase 4. `applyPack` and `importPackSeeds` as separate entry points
(Decision 5), the `content` naming (Decision 10) and the vocabulary (Decision 11) through the manifest, the
pack trees, the goldens, the docs and the pack-facing API. `api:update` and `schema:update` are part of this
phase, as is rewriting every pack manifest in the tree — all of them are in this repo, so the rename is a
change the typecheck and `abuddy validate` prove you finished.

**The split rides here rather than going first**, although it is the conceptual error and is expressible
today. It touches the files Phase 2 rewrites, so doing it standalone migrates every caller twice; and until
the applied content exists, the two entry points differ only in which of the five scattered fingerprints they
read, which is the thing Phase 2 removes.

**Done when:** the structural spec asserts the applied content is unreachable from the import path; the
noun/verb guard is extended the way it already works — by return type, so a function handing back
`ApplyResult` says `apply` in its name and one handing back `ImportResult` says `import`
(`import-is-the-verb.spec.ts` becomes `the-verbs.spec.ts` and keeps reading signatures rather than names —
the audit also proposed "no identifier contains both the noun and a verb stem", which is dropped: a scan
cannot tell a verb stem from a noun, so it would report false findings for no gain the return-type rule
does not already give);
`npm run spec`, `typecheck`, `compile`, `test:external-pack` and `chain` pass; the published reports record
only the intended surface change.

### Phase 4 — the offer

After Phase 3. Decisions 7 and 8: the `onUserEdit` key, where a conflict is held, and the UI — which draws both
kinds of flag, a newer version of something you changed and an edited item the pack has removed.

- The backend records offers per item and publishes them like any other state.
- The view: the banner, the two-pane diff with the parts labelled from the hashes, and the three choices.
- "Reset to factory" is a second button on the same call (Decision 5): one item, `force: true`. Where
  "take the new version" answers an offer, this is available on any item the user has edited with no newer
  version waiting — someone who simply wants the shipped one back. Two prompts, one code path.

**Done when:** a spec covers each of the three choices; "keep mine" is not re-offered by a release that
leaves the item alone and is re-offered once the item itself changes (Decision 8's `dismissed` hash); the
fork default is covered, so a note never produces an offer; a spec asserts `force` is reachable only from
the import path; `drive/` exercises the banner and the diff in the running app.

## Verification

Each phase runs the narrow checks in its "Done when" during the work, and `npm run chain` once at the end.
Phases 1 and 2 touch `@abuddy/sdk/src`, which the CLI and testing bundles inline, so expect a near-cold
chain (~170s) rather than a warm one. Phase 3 rewrites the manifest of every pack in the tree, so
`test:external-pack` and `test:packaged-authoring` are part of its own checks rather than an afterthought.

## Risks

- **A development dir carries entities the applied content does not know**, which is the same path as a user's entity that
  matches a content item's identity: it is left as the user's rather than adopted. Resetting is the
  intended answer and the specs cover the path; there is nothing to migrate.
- **Phase 3 is a wide rename** touching the manifest, every pack, the goldens and a published API. It is
  worth it bundled with the rewrite Phase 2 does and is churn on its own, which is why it is ordered after.
- **The offer UI is the first place this subsystem becomes visible to users.** A badge that appears on
  content nobody cares about is worse than silence, which is why the default is fork and why only three
  content kinds ever offer.

## What this is not

- **Not a sync engine or a CRDT.** One writer per entity, no concurrency to resolve.
- **Not per-field auto-merge.** Decision 4; the parts exist for detection and display.
- **Not a growing ledger.** The applied content is bounded by the pack's content plus whatever flags are unresolved;
  a key the content drops leaves it. That is the lesson of `appliedContent`, which records what the content
  defines rather than everything it ever defined.
- **Not a trash for flows and library documents.** Making those entities soft-delete would give recovery,
  and it is a separate change: library reads entities straight off relation walks with raw `qx(...).pickAll()` —
  19 sites in 4 files with no filtered read anywhere — flows and the brain another 4, and neither `linksTo`
  nor `findRelations` filters `deleted`.
- **Not a manifest redesign.** `content.artifacts` is added here because `faqs` needs it and it is two lines
  of schema (Decision 12); everything else about the manifest's shape stays where it is being designed, in
  `goal-manifest-redesign.md`.
