# Changesets

Versions the published packages `@abuddy/sdk`, `@abuddy/cli` and `@abuddy/testing`
together (one fixed group). The app's own version is owned by `build/release/release.sh`.

```bash
npx changeset          # describe a change to the packages
npx changeset version  # bump versions + changelogs (the publish workflow does this in a PR)
npm run packages:publish -- --dry-run
```

The workspace packages stay `private` and point at `src/`; `npm run packages:build`
writes the publishable copies to `packages/<name>/dist/package`, and only those are
published (`.github/workflows/publish-packages.yml`).
