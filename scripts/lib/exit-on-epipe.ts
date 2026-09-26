/**
 * Exit quietly when the thing reading our stdout goes away.
 *
 * `npm run chain | head` closes the pipe under the writer, and an unhandled EPIPE crashes with a stack
 * trace that reads like a chain failure and is not one. Piping is a normal thing to do to these commands —
 * `--dry` output especially — so they end the way `head` expects.
 *
 * One module because it is the one place `process.exit()` is right in an orchestrator: stdout is already
 * closed, so there is nothing left to flush, which is the opposite of the case
 * `orchestrator-exit.spec.ts` exists to prevent. That spec names this file as its single exception rather
 * than matching a comment on a line, which is what it did before this was extracted.
 */
export function exitOnEpipe(): void {
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    // Only EPIPE: attaching a listener at all stops Node throwing on any stdout error, so anything else
    // would be swallowed silently, which is worse than the crash this prevents.
    if (err.code !== 'EPIPE') throw err;
    process.exit(0);
  });
}
