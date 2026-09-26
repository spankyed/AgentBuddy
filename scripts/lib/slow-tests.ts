// eslint-disable-next-line no-control-regex -- the runners colour their output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * The slowest tests a step reported, from the output the chain already buffers.
 *
 * Vitest's default reporter prints any test over its 300ms `slowTestThreshold` indented under its file, so
 * this reads what is already there rather than adding a reporter, a JSON file or a flag — which is also why
 * it keeps working when `test:unit` becomes one root vitest run
 * (`docs/plans/test-unit-scheduling.md`). Tests under that threshold are not listed because they were not
 * reported, which is the right cut for someone profiling a suite.
 */
export function slowestTests(output: string, limit = 5): { name: string; ms: number }[] {
  const found: { name: string; ms: number }[] = [];
  for (const raw of output.replace(ANSI, '').split('\n')) {
    // Indented past a file's own line, which carries a `(N tests)` count and is the whole file's time
    const match = /^\s{3,}[✓×]\s+(.+?)\s+(\d+)ms\s*$/.exec(raw);
    if (!match || /\(\d+ tests?\)/.test(match[1])) continue;
    found.push({ name: match[1].trim(), ms: Number(match[2]) });
  }
  return found.sort((a, b) => b.ms - a.ms).slice(0, limit);
}

