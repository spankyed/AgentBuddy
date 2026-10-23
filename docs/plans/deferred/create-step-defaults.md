# The flow `create` step and an entity's defaults

Status: deferred by request, 2026-10-23. Notes to come back to; nothing designed.

## The gap

The engine refuses a created row that lacks a field its shape requires (`REQUIRED_FIELD`, `550934b79c`). The flow
`create` step (`packages/default-setup/src/extensions/steps/create/`) writes only what a flow maps and lists, so a
user's flow that creates a `Note` with just a title now fails the step with that error. Before, it made a note
missing `noteType`, `content` and the rest, which the Notes surface reads as present.

The refusal is correct; the experience is not. An author has to know and list every required field of a type
they did not write.

## The idea

An entity type already has one place that knows how to make a complete row: its content writer's `create` hook
(`noteContentWriter` calls `noteCommands.create`, which fills a new note's defaults). The step could create through
that hook when the type has one (`_contentWriterRegistry`), and fall back to `untypedCreate` otherwise.

## Questions before building

- Is a content writer the right owner of "a new row's defaults", or should that be its own declared contribution
  (a per-entity `defaults` beside the shape) that both content and the step read?
- What the step's result row and `inferLabel` mean when a hook, not the step, wrote the row.
- Whether `update`'s `onMissing: 'create'` takes the same path.
- The step's form could list a type's required fields, so an author sees them before running the flow.
