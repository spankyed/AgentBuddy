// The user's API keys: the only way a key's value reaches the backend. These procedures call the host store directly,
// never the event bus, so a value reaches no bus log, no `onIncoming` listener and no event; none returns a value.
import { z } from 'zod';
import { getDesignated, hasDesignation } from '@abuddy/sdk';
import { providerLabels } from '@abuddy/sdk/models';
import type { SecretsSnapshot } from '@abuddy/sdk/rpc';
import { getRegisteredSystems } from '@abuddy/host/packs';
import { secretsStore } from '@abuddy/host/secrets';
import { rootEvents } from '@/core/router/bus-emitter';
import { procedure, router } from './trpc';

const provider = z.enum([...(Object.keys(providerLabels) as [string, ...string[]]), 'custom']) as z.ZodType<SecretsSnapshot['secrets'][number]['provider']>;
const id = z.string().min(1);
const label = z.string().min(1).max(100);
const value = z.string().min(1).max(10_000);

const snapshot = (): SecretsSnapshot => ({ secrets: secretsStore.list(), status: secretsStore.status() });

/**
 * Tells the settings system (no values) whenever the stored keys or their protection change, through these procedures,
 * `services.secrets` or a failing credential store, so it refreshes its plugin and key checks. Registered once at boot.
 * Before a settings system is registered there's none to tell: once it runs, it sends the current keys on
 * CLIENT_CONNECTED.
 */
export function forwardSecretsChanges(): () => void {
  return secretsStore.onChange(() => {
    if (!hasDesignation('settings')) return;
    const systemId = getDesignated('settings');
    if (getRegisteredSystems().has(systemId)) rootEvents.emitIncoming({ type: 'SECRETS_CHANGED', systemId });
  });
}

export const secretsRouter = router({
  list: procedure.query(() => snapshot()),
  add: procedure
    .input(z.object({ provider, label, value }))
    .mutation(({ input }) => {
      secretsStore.add(input.provider, input.label, input.value);
      return snapshot();
    }),
  replaceValue: procedure
    .input(z.object({ id, value }))
    .mutation(({ input }) => {
      secretsStore.replaceValue(input.id, input.value);
      return snapshot();
    }),
  select: procedure.input(z.object({ id })).mutation(({ input }) => {
    secretsStore.select(input.id);
    return snapshot();
  }),
  rename: procedure.input(z.object({ id, label })).mutation(({ input }) => {
    secretsStore.rename(input.id, input.label);
    return snapshot();
  }),
  delete: procedure.input(z.object({ id })).mutation(({ input }) => {
    secretsStore.delete(input.id);
    return snapshot();
  }),
  allowUnprotected: procedure.mutation(() => {
    secretsStore.allowUnprotected();
    return snapshot();
  }),
});
