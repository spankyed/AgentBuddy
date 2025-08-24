export interface ApiKeyConfig {
  provider: string;
  label: string;
  placeholder: string;
  description: string;
  value?: string;
  isVisible?: boolean;
}

export interface CustomApiKeyConfig {
  id: string;
  name: string;
  eventName: string;
  value: string;
  description?: string;
  isVisible?: boolean;
}

export enum ApiKeyProvider {
  GOOGLE = 'google',
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai'
}

export const BUILT_IN_PROVIDERS: Record<ApiKeyProvider, ApiKeyConfig> = {
  [ApiKeyProvider.GOOGLE]: {
    provider: ApiKeyProvider.GOOGLE,
    label: 'Google API Key',
    placeholder: 'Enter your Google API key',
    description: 'Used for Google AI services and APIs'
  },
  [ApiKeyProvider.ANTHROPIC]: {
    provider: ApiKeyProvider.ANTHROPIC,
    label: 'Anthropic API Key',
    placeholder: 'Enter your Anthropic API key',
    description: 'Used for Claude and other Anthropic models'
  },
  [ApiKeyProvider.OPENAI]: {
    provider: ApiKeyProvider.OPENAI,
    label: 'OpenAI API Key',
    placeholder: 'Enter your OpenAI API key',
    description: 'Used for GPT models and OpenAI services'
  }
};