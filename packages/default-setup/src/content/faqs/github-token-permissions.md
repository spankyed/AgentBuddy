---
category: github
order: 3
---
# Why does the PR panel say my GitHub token is missing permissions?

The GitHub CLI (gh) can have multiple authenticated accounts, but only one is active at a time. The active token may lack the permissions needed for PR operations.

**Common scenarios:**
- **GITHUB_TOKEN env var with a fine-grained PAT** — needs explicit "Pull requests: Read and write" permission in GitHub > Settings > Developer settings > Fine-grained tokens.
- **GITHUB_TOKEN env var with a classic PAT** — needs the `repo` scope in GitHub > Settings > Developer settings > Tokens (classic).
- **Keyring OAuth token** — run `gh auth refresh -s repo` to add missing scopes.

**To diagnose:** run `gh auth status` in your terminal to see which token is active and its type. Token prefixes indicate the type: `github_pat_` = fine-grained PAT, `ghp_` = classic PAT, `gho_` = OAuth.

**To switch accounts:** run `gh auth switch` to change the active account. To stop using an env var token: unset the `GITHUB_TOKEN` environment variable.
