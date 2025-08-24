import { BaseSecretProvider } from './base-provider';
import { SecretProviderType } from './types';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';

/**
 * Built-in provider for predefined API key types
 */
export class BuiltInSecretProvider extends BaseSecretProvider {
  readonly isBuiltIn = true;
  
  constructor(
    public readonly type: SecretProviderType,
    public readonly name: string,
    secretId?: string
  ) {
    super(secretId);
  }
  
  protected getSecretName(): string {
    return `${this.type}_api`;
  }
  
  protected getDescription(): string {
    const descriptions: Record<string, string> = {
      [SecretProviderType.GOOGLE]: 'Google API key for services',
      [SecretProviderType.ANTHROPIC]: 'Anthropic API key for Claude',
      [SecretProviderType.OPENAI]: 'OpenAI API key for GPT models'
    };
    
    return descriptions[this.type] || `${this.name} API key`;
  }
  
  protected persistSecretId(secretId?: string): void {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings.general.apiKeys;
    
    // Update the appropriate field based on provider type
    const updatedApiKeys = {
      ...apiKeys,
      [this.type]: secretId
    };
    
    settingsCommands.updateSettings('general', 'apiKeys', [], updatedApiKeys);
  }
  
  static fromSettings(type: SecretProviderType): BuiltInSecretProvider {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings.general.apiKeys;
    const secretId = apiKeys[type as keyof typeof apiKeys] as string | undefined;
    
    const names: Record<SecretProviderType, string> = {
      [SecretProviderType.GOOGLE]: 'Google',
      [SecretProviderType.ANTHROPIC]: 'Anthropic',
      [SecretProviderType.OPENAI]: 'OpenAI',
      [SecretProviderType.CUSTOM]: 'Custom'
    };
    
    return new BuiltInSecretProvider(type, names[type], secretId);
  }
}