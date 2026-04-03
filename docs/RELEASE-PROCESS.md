Act as a senior DevOps engineer to streamline the release process for the AgentBuddy Electron app. The production build pipeline (`npm run build-prod` via `build/build.sh`) already produces a signed/notarized `.app`, `.dmg`, and `.zip` for macOS ARM64, and a GitHub Actions workflow exists at `.github/workflows/build-mac.yml` that builds on version tags. Code signing and notarization are configured in `electron-builder.mjs` via environment variables (`APPLE_TEAM_ID`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `CSC_LINK`, `CSC_KEY_PASSWORD`).

Automate the end-to-end release flow so that cutting a release is a single command. Set up the following:

1. **Version bumping** — Add an `npm run release` script (or similar) that bumps the version in `package.json` (and any other places the version appears), creates a git tag (`v0.x.x`), and pushes the tag to trigger the CI workflow. Support `patch`, `minor`, and `major` bumps. Consider using `standard-version`, `release-it`, or a simple shell script — pick whichever is lightest.

2. **CI workflow improvements** — Update `.github/workflows/build-mac.yml` to:
   - Extract the version from the git tag and validate it matches `package.json`
   - Generate release notes from commit history (or a changelog) and include them in the GitHub Release body
   - Transition the release from draft to published automatically (or keep as draft with a manual publish step — recommend which is safer)
   - Add a `workflow_dispatch` input to allow manual builds with an optional version override
   - Cache `node_modules` and native module rebuilds to speed up builds
   - Add build status badges

3. **Changelog** — Set up automatic changelog generation from conventional commits. Configure it to group by type (features, fixes, etc.) and include in both the release notes and a `CHANGELOG.md` file.

4. **Local signed builds** — Add an `npm run build-prod:signed` convenience script that sources credentials from `.env.signing` (gitignored) and runs the production build with signing enabled, for cases where you want to distribute a signed build without going through CI.

5. **Pre-release validation** — Before tagging, run type checking (`npm run typecheck`) and the test suite (`npm test`) as a gate. The release script should abort if either fails.

Reference the existing build infrastructure: `build/build.sh` (7-step build), `electron-builder.mjs` (notarize + publish config), `package.json` (scripts), and `.github/workflows/build-mac.yml`. The app uses npm workspaces with Node >= 23. Keep the solution simple — this is a small team shipping to a small number of users, not a large-scale CI/CD pipeline.
