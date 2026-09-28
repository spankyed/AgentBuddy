/**
 * The subject a check asserted over, confirmed to be there: a population it could not read is a check that
 * proves nothing, and a green run cannot tell you which kind it was.
 *
 * **Where a population is assembled from a written-down list of contributors, guard each one here rather than
 * the total.** A total cannot see one contributor go missing: `published-declarations` named three packages,
 * summed their declarations and put a floor under the sum, and two of the three could fail to install without
 * moving the total past it — so the check compiled what was left and reported green. A population derived from
 * a walk of the tree does not have this problem, since it cannot name something that is not there.
 *
 * `atLeast` is for one subject with a known shape, whose collapse would not take it to zero: a fixture manifest
 * declaring one feature names four paths, and three of them would satisfy a bare emptiness test. It is not a
 * way to cover several contributors at once — a floor chosen to span them is the shape above, and it hides
 * exactly what it is meant to catch. Where the count is a domain fact rather than a floor under the scan,
 * assert it directly instead; this is for "did I read anything real", not for what was read.
 */
export function population<T>(what: string, xs: readonly T[], opts: { atLeast?: number } = {}): readonly T[] {
  const atLeast = opts.atLeast ?? 1;
  if (xs.length < atLeast) {
    throw new Error(`${what}: found ${xs.length}, expected at least ${atLeast} — anything asserted over it would pass for the wrong reason`);
  }
  return xs;
}
