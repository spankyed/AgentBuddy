# Actual App Screenshot References

Durable app screenshots for visual fidelity review belong in this directory.

The manifest at `packages/video/src/agentbuddy-ui/ACTUAL_APP_REFERENCES.md` is authoritative for required filenames. While a row still uses `conversation:*` or `NEEDS_SCREENSHOT`, the film can use that as working evidence, but the broader launch-film goal is not complete.

Capture requirements:

- Use real AgentBuddy app UI, not the Remotion replica.
- Keep screenshots unedited except for normal image cropping to the relevant surface.
- Prefer PNG.
- Match the target filenames listed in `ACTUAL_APP_REFERENCES.md`.
- After adding or replacing screenshots, run `npm run audit:fidelity --workspace @app/video`.
