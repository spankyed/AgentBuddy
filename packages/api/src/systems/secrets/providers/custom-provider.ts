import { BaseSecretProvider } from './base-provider';
import { SecretProviderType, CustomSecretConfig } from './types';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';

/**
 * Custom provider for user-defined API keys
 */
export class CustomSecretProvider extends BaseSecretProvider {
  readonly type = SecretProviderType.CUSTOM;
  readonly isBuiltIn = false;
  
  private config: CustomSecretConfig;
  
  constructor(config: CustomSecretConfig) {
    super(config.secretId);
    this.config = config;
  }
  
  get name(): string {
    return this.config.name;
  }
  
  get eventName(): string {
    return this.config.eventName;
  }
  
  protected getSecretName(): string {
    return `custom_${this.config.eventName}`;
  }
  
  protected getDescription(): string {
    return this.config.description || `Custom API key for ${this.config.name}`;
  }
  
  protected persistSecretId(secretId?: string): void {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings.general.apiKeys;
    
    if (!apiKeys.custom) {
      apiKeys.custom = [];
    }
    
    // Update the custom key in the array
    const index = apiKeys.custom.findIndex(k => k.id === this.config.id);
    
    if (secretId) {
      const updatedConfig = { ...this.config, secretId };
      
      if (index >= 0) {
        apiKeys.custom[index] = updatedConfig;
      } else {
        apiKeys.custom.push(updatedConfig);
      }
      
      this.config = updatedConfig;
    } else if (index >= 0) {
      // Remove the custom key if no secret ID
      apiKeys.custom.splice(index, 1);
    }
    
    settingsCommands.updateSettings('general', 'apiKeys', [], apiKeys);
  }
  
  validate(): boolean {
    return !!(this.config.eventName && this.config.name);
  }
  
  static fromConfig(config: CustomSecretConfig): CustomSecretProvider {
    return new CustomSecretProvider(config);
  }
  
  static getAllFromSettings(): CustomSecretProvider[] {
    const settings = settingsQueries.getSettings();
    const customKeys = settings.general.apiKeys.custom || [];
    
    return customKeys.map(config => new CustomSecretProvider(config));
  }
}