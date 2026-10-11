# Changesets

Versions the published packages `@apackdev/ears`, `@apackdev/sdk`, `@apackdev/ui`, `@apackdev/cli` and `@apackdev/testing`
together (one fixed group). The app's own version is owned by `build/release/release.sh`.

```bash
npx changeset          # describe a change to the packages
npx changeset version  # bump versions + changelogs (the publish workflow does this in a PR)
npm run packages:publish -- --dry-run
```

`npm run packages:build` builds every package's `dist/`. `@apackdev/ears`, `@apackdev/sdk` and `@apackdev/ui` publish
their workspace package (`packages/apack-ears`, `packages/apack-sdk`, `packages/apack-ui`), whose exports resolve
`dist/` outside the monorepo. `@apackdev/cli` and `@apackdev/testing` stay `private` in the workspace
and publish the bundled copy the build writes to `packages/<name>/dist/package`
(`scripts/publish-packages.ts`, run by `.github/workflows/publish-packages.yml`).
