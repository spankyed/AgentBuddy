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
import { AsyncLocalStorage } from 'node:async_hooks';
import { _installAsyncDeliveryReader, _runDelivery, type _Delivery } from '@abuddy/sdk/events';

const storage = new AsyncLocalStorage<_Delivery>();

_installAsyncDeliveryReader(() => storage.getStore());

/**
 * Runs `body` as the handling of `delivery`: a send made inside it carries the handler's ref as `Message.sender`,
 * and `reply` answers the message's own sender on its own connection.
 *
 * Both holders are set, not one: the async store is what survives an `await`, and the SDK's synchronous variable
 * is what a reader sees if this module was never loaded — so the two never disagree about one delivery.
 */
export function deliverAs<T>(delivery: _Delivery, body: () => T): T {
  return storage.run(delivery, () => _runDelivery(delivery, body));
}
