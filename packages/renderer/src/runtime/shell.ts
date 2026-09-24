// This window's app shell: the host's machine (`createShellMachine`, @abuddy/host/fe) over this window's I/O. Every
// member below is one adapter or one resource, so what the window gives the host is the list in this call.
import { createPackFrontends, createShellMachine } from '@abuddy/host/fe';
import { windowNotify } from '@/adapters/notify';
import { packFrontendIO } from '@/adapters/pack-frontends';
import { windowStorage } from '@/adapters/storage';
import { fePacks } from '@/runtime/packs';
import { feClient } from '@/transport/client';

const packFrontends = createPackFrontends(packFrontendIO, fePacks);

/** The app shell over this window's I/O; started by main.ts under `HOST.application` */
export function createAppShell() {
  return createShellMachine({
    packs: fePacks,
    client: feClient,
    packFrontends,
    storage: windowStorage,
    notify: windowNotify,
    target: window,
  });
}
