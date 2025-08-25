import { setup } from 'xstate';
import { EARS } from '@/core/types';
import { secretsQueries, secretsCommands } from './repository';
import type { SecretProvider, CreateSecretParams, SecretData } from './types';

// Events this child actor can receive from its parent (settings system)
export type SecretsEvents = 
  | { type: 'SECRETS.CMD.CREATE_API_KEY'; provider: string; value: string; customName?: string }
  | { type: 'SECRETS.CMD.UPDATE_API_KEY'; id: string; value: string }
  | { type: 'SECRETS.CMD.DELETE_API_KEY'; id: string }
  | { type: 'SECRETS.CMD.GET_API_KEYS' }
  | { type: 'GET_SECRET_VALUE'; id: EARS.EntityId }
  | { type: 'RETRIEVE_SECRET_VALUE'; id: EARS.EntityId; requester: string };

// Events sent back to parent
export type SecretsOutputEvents =
  | { type: 'SECRETS.EVENT.LOADED'; data: SecretData[] }
  | { type: 'SECRETS.EVENT.CREATED'; id: EARS.EntityId; provider: SecretProvider; customName?: string }
  | { type: 'SECRETS.EVENT.UPDATED'; id: EARS.EntityId }
  | { type: 'SECRETS.EVENT.DELETED'; id: EARS.EntityId }
  | { type: 'SECRETS.EVENT.VALUE'; id: EARS.EntityId; value: string }
  | { type: 'SECRETS.EVENT.ERROR'; message: string };

export const secretsActor = setup({
  types: {
    input: {} as { parentRef: any },
    events: {} as SecretsEvents,
    output: {} as SecretsOutputEvents,
  },
  actions: {
    createSecret: ({ context, event, self }) => {
      const ev = event as Extract<SecretsEvents, { type: 'SECRETS.CMD.CREATE_API_KEY' }>;
      
      try {
        const params: CreateSecretParams = {
          provider: ev.provider as SecretProvider,
          value: ev.value,
          customName: ev.customName
        };
        
        const id = secretsCommands.createSecret(params);
        
        self._parent?.send({
          type: 'SECRETS.EVENT.CREATED',
          id,
          provider: ev.provider,
          customName: ev.customName
        });
        
        // Also send updated list
        const secrets = secretsQueries.getSecretsData();
        self._parent?.send({
          type: 'SECRETS.EVENT.LOADED',
          data: secrets
        });
      } catch (error) {
        self._parent?.send({
          type: 'SECRETS.EVENT.ERROR',
          message: `Failed to create secret: ${error}`
        });
      }
    },
    
    updateSecret: ({ event, self }) => {
      const ev = event as Extract<SecretsEvents, { type: 'SECRETS.CMD.UPDATE_API_KEY' }>;
      
      try {
        const id = secretsCommands.updateSecret(ev.id as EARS.EntityId, ev.value);
        
        self._parent?.send({
          type: 'SECRETS.EVENT.UPDATED',
          id
        });
        
        // Send updated list
        const secrets = secretsQueries.getSecretsData();
        self._parent?.send({
          type: 'SECRETS.EVENT.LOADED',
          data: secrets
        });
      } catch (error) {
        self._parent?.send({
          type: 'SECRETS.EVENT.ERROR',
          message: `Failed to update secret: ${error}`
        });
      }
    },
    
    deleteSecret: ({ event, self }) => {
      const ev = event as Extract<SecretsEvents, { type: 'SECRETS.CMD.DELETE_API_KEY' }>;
      
      try {
        const success = secretsCommands.deleteSecret(ev.id as EARS.EntityId);
        
        if (success) {
          self._parent?.send({
            type: 'SECRETS.EVENT.DELETED',
            id: ev.id
          });
          
          // Send updated list
          const secrets = secretsQueries.getSecretsData();
          self._parent?.send({
            type: 'SECRETS.EVENT.LOADED',
            data: secrets
          });
        } else {
          self._parent?.send({
            type: 'SECRETS.EVENT.ERROR',
            message: 'Secret not found'
          });
        }
      } catch (error) {
        self._parent?.send({
          type: 'SECRETS.EVENT.ERROR',
          message: `Failed to delete secret: ${error}`
        });
      }
    },
    
    getSecrets: ({ self }) => {
      const secrets = secretsQueries.getSecretsData();
      
      self._parent?.send({
        type: 'SECRETS.EVENT.LOADED',
        data: secrets
      });
    },
    
    getSecretValue: ({ event, self }) => {
      const ev = event as Extract<SecretsEvents, { type: 'GET_SECRET_VALUE' }>;
      
      const secret = secretsQueries.getSecret(ev.id);
      if (secret) {
        self._parent?.send({
          type: 'SECRETS.EVENT.VALUE',
          id: ev.id,
          value: secret.encryptedValue // Will be plain text for now
        });
      } else {
        self._parent?.send({
          type: 'SECRETS.EVENT.ERROR',
          message: 'Secret not found'
        });
      }
    },
    
    retrieveSecretValue: ({ event, self }) => {
      const ev = event as Extract<SecretsEvents, { type: 'RETRIEVE_SECRET_VALUE' }>;
      
      const secret = secretsQueries.getSecret(ev.id);
      if (secret) {
        // Send value back to parent for internal system use
        console.log(`[Secrets] Retrieved value for ${ev.requester}: ${ev.id}`);
        self._parent?.send({
          type: 'SECRETS.EVENT.VALUE',
          id: ev.id,
          value: secret.encryptedValue
        });
      }
    },
    
    sendSecretsStartupData: ({ self }) => {
      const secrets = secretsQueries.getSecretsData();
      
      self._parent?.send({
        type: 'SECRETS.EVENT.LOADED',
        data: secrets
      });
    }
  }
}).createMachine({
  id: 'secrets',
  initial: 'ready',
  entry: 'sendSecretsStartupData',
  states: {
    ready: {
      on: {
        'SECRETS.CMD.CREATE_API_KEY': {
          actions: 'createSecret',
        },
        'SECRETS.CMD.UPDATE_API_KEY': {
          actions: 'updateSecret',
        },
        'SECRETS.CMD.DELETE_API_KEY': {
          actions: 'deleteSecret',
        },
        'SECRETS.CMD.GET_API_KEYS': {
          actions: 'getSecrets',
        },
        GET_SECRET_VALUE: {
          actions: 'getSecretValue',
        },
        RETRIEVE_SECRET_VALUE: {
          actions: 'retrieveSecretValue',
        }
      }
    }
  }
});