import { secretsCommands, secretsQueries } from '@/systems/secrets/repository';
import { settingsCommands, settingsQueries } from '../repository';
import type { SettingsData } from '../types';

/**
 * Check if a value is a secret ID (starts with "Secret-")
 */
function isSecretId(value: string): boolean {
  return value.startsWith('Secret-');
}

/**
 * Migrate existing API keys from plain text to encrypted secrets
 */
export function migrateApiKeysToSecrets(): void {
  try {
    const settings = settingsQueries.getSettings();
    if (!settings?.general?.apiKeys) {
      return;
    }
    
    const apiKeys = settings.general.apiKeys;
    let hasChanges = false;
    
    // Migrate Google API key
    if (apiKeys.google && !isSecretId(apiKeys.google)) {
      console.log('[Migration] Migrating Google API key to secret');
      const secretId = secretsCommands.createSecret(
        'google_api',
        apiKeys.google,
        'google',
        'Google API key for services'
      );
      apiKeys.google = secretId;
      hasChanges = true;
    }
    
    // Migrate Anthropic API key
    if (apiKeys.anthropic && !isSecretId(apiKeys.anthropic)) {
      console.log('[Migration] Migrating Anthropic API key to secret');
      const secretId = secretsCommands.createSecret(
        'anthropic_api',
        apiKeys.anthropic,
        'anthropic',
        'Anthropic API key for Claude'
      );
      apiKeys.anthropic = secretId;
      hasChanges = true;
    }
    
    // Migrate OpenAI API key
    if (apiKeys.openai && !isSecretId(apiKeys.openai)) {
      console.log('[Migration] Migrating OpenAI API key to secret');
      const secretId = secretsCommands.createSecret(
        'openai_api',
        apiKeys.openai,
        'openai',
        'OpenAI API key for GPT models'
      );
      apiKeys.openai = secretId;
      hasChanges = true;
    }
    
    // Initialize custom array if it doesn't exist
    if (!apiKeys.custom) {
      apiKeys.custom = [];
    }
    
    // Save updated settings if any migrations occurred
    if (hasChanges) {
      settingsCommands.updateSettings('general', 'apiKeys', [], apiKeys);
      console.log('[Migration] API keys successfully migrated to secrets');
    }
  } catch (error) {
    console.error('[Migration] Error migrating API keys to secrets:', error);
  }
}

/**
 * Verify that all API key references point to valid secrets
 */
export function verifyApiKeySecrets(): boolean {
  try {
    const settings = settingsQueries.getSettings();
    if (!settings?.general?.apiKeys) {
      return true; // No API keys configured
    }
    
    const apiKeys = settings.general.apiKeys;
    let allValid = true;
    
    // Check Google API key
    if (apiKeys.google && !secretsQueries.secretExists(apiKeys.google)) {
      console.warn(`[Migration] Google API key references non-existent secret: ${apiKeys.google}`);
      allValid = false;
    }
    
    // Check Anthropic API key
    if (apiKeys.anthropic && !secretsQueries.secretExists(apiKeys.anthropic)) {
      console.warn(`[Migration] Anthropic API key references non-existent secret: ${apiKeys.anthropic}`);
      allValid = false;
    }
    
    // Check OpenAI API key
    if (apiKeys.openai && !secretsQueries.secretExists(apiKeys.openai)) {
      console.warn(`[Migration] OpenAI API key references non-existent secret: ${apiKeys.openai}`);
      allValid = false;
    }
    
    // Check custom API keys
    if (apiKeys.custom) {
      for (const customKey of apiKeys.custom) {
        if (!secretsQueries.secretExists(customKey.secretId)) {
          console.warn(`[Migration] Custom API key '${customKey.name}' references non-existent secret: ${customKey.secretId}`);
          allValid = false;
        }
      }
    }
    
    return allValid;
  } catch (error) {
    console.error('[Migration] Error verifying API key secrets:', error);
    return false;
  }
}

/**
 * Clean up orphaned secrets (secrets not referenced by any settings)
 */
export function cleanupOrphanedSecrets(): void {
  try {
    const settings = settingsQueries.getSettings();
    const allSecrets = secretsQueries.getAllSecrets();
    
    // Collect all referenced secret IDs
    const referencedSecretIds = new Set<string>();
    
    if (settings?.general?.apiKeys) {
      const apiKeys = settings.general.apiKeys;
      
      if (apiKeys.google) referencedSecretIds.add(apiKeys.google);
      if (apiKeys.anthropic) referencedSecretIds.add(apiKeys.anthropic);
      if (apiKeys.openai) referencedSecretIds.add(apiKeys.openai);
      
      if (apiKeys.custom) {
        for (const customKey of apiKeys.custom) {
          referencedSecretIds.add(customKey.secretId);
        }
      }
    }
    
    // Find and delete orphaned secrets
    let deletedCount = 0;
    for (const secret of allSecrets) {
      if (!referencedSecretIds.has(secret.id)) {
        console.log(`[Migration] Deleting orphaned secret: ${secret.id} (${secret.name})`);
        secretsCommands.deleteSecret(secret.id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[Migration] Cleaned up ${deletedCount} orphaned secrets`);
    }
  } catch (error) {
    console.error('[Migration] Error cleaning up orphaned secrets:', error);
  }
}