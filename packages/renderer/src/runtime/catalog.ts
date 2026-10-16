// Declaration discovery is independent of executable frontend acceptance and settings authority.
import { createWindowPackCatalog, hostDeclaration } from '@apackdev/host/fe';
import { trpc } from '@/transport';

export const windowCatalog = createWindowPackCatalog({
  subscribe(receive, failed) {
    const subscription = trpc.packs.catalog.subscribe(undefined, { onData: receive, onError: failed });
    return () => subscription.unsubscribe();
  },
}, [hostDeclaration]);
