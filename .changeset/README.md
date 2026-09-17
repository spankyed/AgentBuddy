# Changesets

Versions the published packages `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/ui`, `@abuddy/cli` and `@abuddy/testing`
together (one fixed group). The app's own version is owned by `build/release/release.sh`.

```bash
npx changeset          # describe a change to the packages
npx changeset version  # bump versions + changelogs (the publish workflow does this in a PR)
npm run packages:publish -- --dry-run
```

`npm run packages:build` builds every package's `dist/`. `@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` publish
their workspace package (`packages/abuddy-ears`, `packages/abuddy-sdk`, `packages/abuddy-ui`), whose exports resolve
`dist/` outside the monorepo. `@abuddy/cli` and `@abuddy/testing` stay `private` in the workspace
and publish the bundled copy the build writes to `packages/<name>/dist/package`
(`scripts/publish-packages.ts`, run by `.github/workflows/publish-packages.yml`).
