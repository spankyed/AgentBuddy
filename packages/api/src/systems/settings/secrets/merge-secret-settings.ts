import type { SecretData } from './types';

const STANDARD_PROVIDERS = ['google', 'anthropic', 'openai', 'groq', 'mistral', 'cohere'] as const;

type SecretsSettings = Record<string, any> & {
  custom?: Record<string, string>;
};

export function mergeSecretReferences(
  currentSecrets: SecretsSettings | null | undefined,
  secretsData: SecretData[],
): SecretsSettings {
  const nextSecrets: SecretsSettings = {
    ...(currentSecrets ?? {}),
    custom: {},
  };

  for (const provider of STANDARD_PROVIDERS) {
    nextSecrets[provider] = null;
  }

  for (const secret of secretsData) {
    if (secret.provider === 'custom' && secret.customName) {
      nextSecrets.custom![secret.customName] = secret.id;
    } else if (STANDARD_PROVIDERS.includes(secret.provider as any)) {
      nextSecrets[secret.provider] = secret.id;
    }
  }

  return nextSecrets;
}
