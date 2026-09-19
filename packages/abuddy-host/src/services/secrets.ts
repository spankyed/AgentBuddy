// services.secrets: the user's API keys as metadata (values stay in the host store; see ../secrets)
import type { SecretsService } from '@abuddy/sdk/services';
import { secretsStore } from '../secrets/index.ts';

export const secrets: SecretsService = {
  status: () => secretsStore.status(),
  list: () => secretsStore.list(),
  select: (id) => secretsStore.select(id),
  rename: (id, label) => secretsStore.rename(id, label),
  delete: (id) => secretsStore.delete(id),
};
