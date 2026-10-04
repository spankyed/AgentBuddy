// Makes the message being handled survive an `await`, which is all the backend adds to the SDK's delivery scope.
//
// The SDK's holder is a plain variable, because `@abuddy/sdk/events` is bundled into pack frontends and a browser
// has no equivalent of this. That is exact for a handler that answers synchronously and wrong for one that awaits
// first — which a backend system routinely does, since its work is I/O. `AsyncLocalStorage` is Node's answer:
// the store is captured when an async resource is created, so a handler's own awaits and timers inherit it, and
// two deliveries interleaving keep their own (measured: two overlapping handlers each answered their own sender).
//
// Installing the reader is a process-wide, one-way step, as binding the host is. Nothing uninstalls it: a process
// that has a bus has it for the process's life, and a test that wants no scope simply does not deliver inside one.
//
// **It happens on the first delivery rather than on import.** `bus/index.ts` re-exports `machine.ts`, which
// imports this, so installing at module scope would make merely importing `@abuddy/host/bus` reconfigure the SDK
// for the whole process — in the CLI, in the pack test harness, in the Playwright runner. Installing here keeps
// the import inert and cannot be forgotten, since nothing reaches a delivery except through this function.
import { AsyncLocalStorage } from 'node:async_hooks';
import { _installAsyncDeliveryReader, _runDelivery, type _Delivery } from '@abuddy/sdk/events';

const storage = new AsyncLocalStorage<_Delivery>();

let installed = false;

/**
 * Runs `body` as the handling of `delivery`: a send made inside it carries the handler's ref as `Message.sender`,
 * and `reply` answers the message's own sender on its own connection.
 *
 * The async store is the mechanism — it is what survives an `await`. `_runDelivery` sets the SDK's synchronous
 * holder as well, which `_currentDelivery` falls back to when no async store is in scope; that is reachable
 * only by a reader in a process that never installed this one, so it costs a call and closes a gap nothing
 * currently opens.
 */
export function deliverAs<T>(delivery: _Delivery, body: () => T): T {
  if (!installed) {
    _installAsyncDeliveryReader(() => storage.getStore());
    installed = true;
  }
  return storage.run(delivery, () => _runDelivery(delivery, body));
}
