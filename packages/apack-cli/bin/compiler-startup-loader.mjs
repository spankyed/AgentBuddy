// The loader thread shares the existing startup file view; Node retains resolution and errors.
const reads = globalThis[Symbol.for('apack.compiler.file-reads')];
if (typeof reads?.observeResolution !== 'function') {
  throw new Error('Compiler loader requires its active startup input owner');
}

export async function resolve(specifier, context, next) {
  reads.observeResolution?.(specifier, context);
  return next(specifier, context);
}
