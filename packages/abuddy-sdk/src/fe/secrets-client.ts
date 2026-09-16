import { trpc } from '../runtime/rpc.ts';
import type { SecretProvider, SecretsSnapshot } from '../services/secrets.ts';

export type { SecretsSnapshot };

/**
 * The user's API keys, for a settings page. Values go in through `add` and `replaceValue` only, over the API
 * client and off the event bus, so they reach no log, event or listener; nothing returns one. Each call
 * resolves with the stored keys (without values) and how they're protected.
 */
export const secretsClient = {
  list: (): Promise<SecretsSnapshot> => trpc.secrets.list.query(),
  add: (provider: SecretProvider, label: string, value: string): Promise<SecretsSnapshot> =>
    trpc.secrets.add.mutate({ provider, label, value }),
  replaceValue: (id: string, value: string): Promise<SecretsSnapshot> => trpc.secrets.replaceValue.mutate({ id, value }),
  select: (id: string): Promise<SecretsSnapshot> => trpc.secrets.select.mutate({ id }),
  rename: (id: string, label: string): Promise<SecretsSnapshot> => trpc.secrets.rename.mutate({ id, label }),
  delete: (id: string): Promise<SecretsSnapshot> => trpc.secrets.delete.mutate({ id }),
  /** Where there's no OS credential store: store keys with a data key kept in a file, as the user chose */
  allowUnprotected: (): Promise<SecretsSnapshot> => trpc.secrets.allowUnprotected.mutate(),
};
