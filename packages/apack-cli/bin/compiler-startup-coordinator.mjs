// Private asynchronous barrier for the main thread's loader; it contributes no resolution/load hooks.
const startup = () => globalThis[Symbol.for('apack.compiler.startup')];
export function initialize({ port }) {
  if (!startup()) throw new Error('Compiler loader requires its native startup capture');
  port.on('message', message => {
    if (message !== 'finish' && message !== 'snapshot') throw new Error('Unknown compiler startup request');
    try { port.postMessage({ observations: startup().finishLocal() }); }
    catch (error) { port.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
    finally { if (message === 'finish') { startup().stopReads(); startup().view.dispose(); port.close(); } }
  });
  port.unref();
}
