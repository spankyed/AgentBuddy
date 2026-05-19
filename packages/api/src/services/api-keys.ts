/**
 * Shared API key resolution for LLM providers.
 *
 * Priority: explicit param > settings/secrets store > env vars.
 */

import { repository } from '@/repository'
import { EARS } from '@/core/types'

export type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere'

const PROVIDER_ALIASES: Record<string, ProviderName> = {
  'openai.responses': 'openai',
}

/** Resolve the base provider name from an alias. */
export function resolveProvider(provider: string): ProviderName {
  return (PROVIDER_ALIASES[provider] || provider) as ProviderName
}

/**
 * Get API key for a provider.
 * Priority: explicitApiKey > production settings > env vars
 */
export function getApiKey(providerName: string, explicitApiKey?: string): string {
  const baseProvider = resolveProvider(providerName)
  if (explicitApiKey) return explicitApiKey

  const isProd = true
  if (isProd) {
    const settings = repository.settingsQueries.getGeneralSettings()
    const secretId = settings.secrets?.[baseProvider] as EARS.EntityId | undefined
    if (secretId) {
      const secret = repository.secretsQueries.getSecret(secretId)
      if (secret?.encryptedValue) return secret.encryptedValue
    }
  } else {
    const envKey = process.env[`${baseProvider.toUpperCase()}_API_KEY`]
    if (envKey) return envKey
  }

  throw new Error(`API key not found for provider: ${baseProvider}`)
}
