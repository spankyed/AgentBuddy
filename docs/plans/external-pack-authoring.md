# Deferred external pack authoring review

Status: deferred; unresolved items retained from the [archived review](../archive/plans/external-pack-authoring-followups.md).
This is a tracking list, not a new implementation plan. Revalidate the unverified findings before changing code.

## Work with an existing goal

- Facade/DSL terminology: absorbed into the descriptor checkpoint in [discovery](discovery-without-activation.md); the original goal is archived.
- Advisory storage locks: [goal-write-lock-advisory.md](../goals/goal-write-lock-advisory.md).

## Release and platform follow-ups

- Create GitHub releases as drafts, upload assets, then publish; handle retries after partial uploads.
  `packages/apack-cli/src/commands/release.ts` still creates a published release before uploading assets.
- Review branch restrictions and pre-publish typecheck/test gates in `.github/workflows/publish-packages.yml`.
  Validate through a workflow run; publishing remains manual and dry-run by default.
- Verify `npx`/`npm` invocation on Windows in the pack release runner. The original review had no Windows verification.
- Exercise release resolution through a real GitHub release cycle. Offline beta-cache and rate-limit behavior
  already have coverage; this item concerns the real release path.

## Findings still requiring inspection

- Build-only facets: whether backend bundling correctly rejects frontend dependencies when `.vue`/`.css` imports are stubbed.
- PATH installation: handling errors other than `EACCES`/`EPERM` in `cli-command.ts` and `MacOSAppMenu.ts`.
- Test fixtures: `readPackLastError` failing open, directory removal racing API shutdown, and console listeners attached after early renderer logs.
- Packaged authoring: strength of the symlink check in `test-packaged-authoring.sh`.

The original request to delete `packages/api/scripts/db/fix-prod-upgrade.ts` is closed: that file is absent.
The saved-beta-choice concern is obsolete, and cache-first resolution is already fixed. Neither remains a task.
