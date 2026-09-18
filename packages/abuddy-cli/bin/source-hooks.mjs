// Resolve hooks for the CLI run from a checkout. Workspace @abuddy/* packages that live in the
// checkout resolve to their source (the @abuddy/source condition in their package.json exports),
// including from packs linked to the checkout. Installed copies, under node_modules or outside
// the checkout, resolve as usual to their dist.
let checkout = '';

/** @param {{ checkout: string }} data file URL of the checkout, with a trailing slash */
export function initialize(data) {
  checkout = data.checkout;
}

export async function resolve(specifier, context, next) {
  // A run that declared it resolves the published packages keeps them, checkout or not
  // (ABUDDY_PACKAGES, PACKAGES_MODE_ENV in @abuddy/sdk/build/source-conditions; read by hand here
  // because these hooks load before anything else)
  if (process.env.ABUDDY_PACKAGES === 'dist') return next(specifier, context);
  if (!specifier.startsWith('@abuddy/') || context.conditions.includes('@abuddy/source')) {
    return next(specifier, context);
  }
  const { conditions } = context;
  try {
    const source = await next(specifier, { ...context, conditions: [...conditions, '@abuddy/source'] });
    if (source.url.startsWith(checkout) && !source.url.slice(checkout.length).split('/').includes('node_modules')) {
      return source;
    }
  } catch {
    // Resolves without the condition, or fails there with the usual error
  }
  // Node merges the context of earlier nextResolve calls, so pass the original conditions again
  return next(specifier, { ...context, conditions });
}
