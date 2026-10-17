// Private asynchronous barrier for the main thread's loader; it contributes no resolution/load hooks.
export function initialize({ port, mode }) {
  if (mode !== 'build' && mode !== 'frontend') throw new Error('Unknown compiler startup owner');
  const startup = () => globalThis[Symbol.for(mode === 'build' ? 'apack.compiler.startup' : 'apack.compiler.frontend')];
  if (!startup()) throw new Error('Compiler loader requires its native startup capture');
  port.on('message', message => {
    if (message !== 'finish' && message !== 'snapshot') throw new Error('Unknown compiler startup request');
    try { port.postMessage({ observations: startup().finishLocal() }); }
    catch (error) { port.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
    finally { if (message === 'finish') { startup().disposeLocal(); port.close(); } }
  });
  port.unref();
}
