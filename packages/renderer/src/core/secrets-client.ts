import type { SecretsClient } from '@abuddy/sdk/fe';
import { trpc } from '@/core/trpc';

/** `secretsClient` in `@abuddy/sdk/fe`: the API's secrets procedures, the only ones pack frontends call directly */
export const secretsClient: SecretsClient = {
  list: () => trpc.secrets.list.query(),
  add: (provider, label, value) => trpc.secrets.add.mutate({ provider, label, value }),
  replaceValue: (id, value) => trpc.secrets.replaceValue.mutate({ id, value }),
  select: (id) => trpc.secrets.select.mutate({ id }),
  rename: (id, label) => trpc.secrets.rename.mutate({ id, label }),
  delete: (id) => trpc.secrets.delete.mutate({ id }),
  allowUnprotected: () => trpc.secrets.allowUnprotected.mutate(),
};
