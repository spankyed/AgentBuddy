/**
 * The subject a check asserted over, confirmed to be there: a population it could not read is a check that
 * proves nothing, and a green run cannot tell you which kind it was.
 *
 * `atLeast` is for a subject whose collapse would not take it to zero — the published declarations are in the
 * hundreds, and one of them surviving a broken walk would satisfy a bare emptiness test while checking almost
 * nothing. Where the count is a domain fact rather than a floor under the scan, assert it directly instead;
 * this is for "did I read anything real", not for what was read.
 */
export function population<T>(what: string, xs: readonly T[], opts: { atLeast?: number } = {}): readonly T[] {
  const atLeast = opts.atLeast ?? 1;
  if (xs.length < atLeast) {
    throw new Error(`${what}: found ${xs.length}, expected at least ${atLeast} — anything asserted over it would pass for the wrong reason`);
  }
  return xs;
}
