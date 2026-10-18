// The loader thread shares the existing startup file view; Node retains resolution and errors.
export async function resolve(specifier, context, next) {
  globalThis[Symbol.for('apack.compiler.file-reads')]?.observeResolution?.(specifier, context);
  return next(specifier, context);
}
