/**
 * Unified auth credential resolution for LLM providers.
 *
 * Supports two auth modes:
 * 1. ChatGPT OAuth — access token + ChatGPT-Account-ID header (Pro subscribers)
 * 2. API key — traditional API key auth
 *
 * Priority: ChatGPT OAuth tokens > explicit API key > settings/secrets > env vars.
 */

import { repository } from '@/repository'
import { EARS } from '@/core/types'
import { getValidCredentials } from './openai-auth/refresh'

export type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere'

const PROVIDER_ALIASES: Record<string, ProviderName> = {
  'openai.responses': 'openai',
}

/** Resolve the base provider name from an alias. */
export function resolveProvider(provider: string): ProviderName {
  return (PROVIDER_ALIASES[provider] || provider) as ProviderName
}

/** Auth credentials for making API calls. */
export interface AuthCredentials {
  type: 'chatgpt' | 'api-key'
  /** Bearer token (ChatGPT access_token or API key). */
  token: string
  /** Extra headers to attach to requests (e.g. ChatGPT-Account-ID). */
  headers?: Record<string, string>
}

/**
 * Get auth credentials for a provider.
 *
 * For OpenAI: tries ChatGPT OAuth first, falls back to API key.
 * For other providers: uses API key only.
 */
export async function getCredentials(providerName: string, explicitApiKey?: string): Promise<AuthCredentials> {
  const baseProvider = resolveProvider(providerName)

  // Explicit API key always wins
  if (explicitApiKey) {
    return { type: 'api-key', token: explicitApiKey }
  }

  // For OpenAI: try ChatGPT OAuth tokens first
  if (baseProvider === 'openai') {
    const chatgptCreds = await getValidCredentials()
    if (chatgptCreds) {
      return {
        type: 'chatgpt',
        token: chatgptCreds.accessToken,
        headers: { 'ChatGPT-Account-ID': chatgptCreds.accountId },
      }
    }
  }

  // Fall back to API key resolution
  const apiKey = getApiKeyFromStore(baseProvider)
  return { type: 'api-key', token: apiKey }
}

/**
 * Get API key for a provider (sync, no ChatGPT auth).
 * Kept for backwards compatibility with services/llm.ts.
 */
export function getApiKey(providerName: string, explicitApiKey?: string): string {
  if (explicitApiKey) return explicitApiKey
  const baseProvider = resolveProvider(providerName)
  return getApiKeyFromStore(baseProvider)
}

/** Resolve API key from settings/secrets store, then env vars. */
function getApiKeyFromStore(baseProvider: ProviderName): string {
  // Try settings/secrets store first
  try {
    const settings = repository.settingsQueries.getGeneralSettings()
    const secretId = settings.secrets?.[baseProvider] as EARS.EntityId | undefined
    if (secretId) {
      const secret = repository.secretsQueries.getSecret(secretId)
      if (secret?.encryptedValue) return secret.encryptedValue
    }
  } catch { /* settings not available — fall through to env */ }

  // Fall back to environment variables
  const envKey = process.env[`${baseProvider.toUpperCase()}_API_KEY`]
  if (envKey) return envKey

  throw new Error(`API key not found for provider: ${baseProvider}`)
}
