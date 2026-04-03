# Preserve collection names via _meta.md marker file

## Context

Library collections exported as markdown become directories via `toSlug` (`"QX Tools"` → `qx-tools/`). On re-import, `toDisplayName` gives back `qx tools` — original casing and the optional `description` are lost. Documents already preserve names via frontmatter. Collections need the same treatment.

## Approach

Write a `_meta.md` file inside each exported collection directory containing frontmatter with the original name and description. On import, if `_meta.md` exists, use its metadata instead of deriving from the directory name.

### Export — `packages/api/src/systems/library/export-markdown.ts`

In the collection branch of `writeItems()` (line 80-89), after creating the subdirectory, write a `_meta.md`:

```markdown
---
name: "QX Tools"
description: "Query tools and utilities"
---
```

### Import — `packages/api/src/systems/library/import-library.ts`

In the directory branch of `importMarkdownDir()` (line 230-241), check for `_meta.md` inside the directory. If found, parse its frontmatter for `name` and `description`. Skip `_meta.md` when processing child files.

### Notes — no change needed

Notes directories already use `index.md` with frontmatter (including the new `title` field). The `index.md` pattern already preserves the name.

## Files to modify

- `packages/api/src/systems/library/export-markdown.ts` — write `_meta.md` in collection dirs
- `packages/api/src/systems/library/import-library.ts` — read `_meta.md` for collection metadata, skip it as a document

## User Verification

1. Create a collection "QX Tools" with description, add a doc
2. Export as markdown → check `qx-tools/_meta.md` has correct frontmatter
3. Re-import → collection name should be "QX Tools" with description preserved
4. Import an old export (no `_meta.md`) → falls back to `toDisplayName` (backward compat)
