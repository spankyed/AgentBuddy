import { BaseEntity } from "@/core/utils/ears";
import type { EARS } from "@/types";

export interface SecretEntity extends BaseEntity {
  entityType: EARS.Entity.Secret;
  name: string;           // e.g., "google_api", "custom_openweather"
  encryptedValue: string; // AES-256-GCM encrypted
  iv: string;            // Initialization vector
  authTag: string;       // Authentication tag
  provider?: string;     // google, anthropic, openai, custom
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type IncomingSecretsEvents = 
  | {
      type: 'GET_SECRET';
      secretId: string;
    }
  | {
      type: 'CREATE_SECRET';
      name: string;
      value: string;
      provider?: string;
      description?: string;
    }
  | {
      type: 'UPDATE_SECRET';
      secretId: string;
      value: string;
    }
  | {
      type: 'DELETE_SECRET';
      secretId: string;
    }
  | {
      type: 'GET_ALL_SECRETS';
    }

export type OutgoingSecretsEvents = 
  | {
      type: 'SECRET_CREATED';
      secretId: string;
    }
  | {
      type: 'SECRET_UPDATED';
      secretId: string;
    }
  | {
      type: 'SECRET_DELETED';
      secretId: string;
    }
  | {
      type: 'SECRET_VALUE';
      secretId: string;
      value: string;
    }
  | {
      type: 'ALL_SECRETS';
      secrets: Array<{
        id: string;
        name: string;
        provider?: string;
        description?: string;
      }>;
    }
  | {
      type: 'SECRET_ERROR';
      message: string;
    }

export type SecretsEvents = IncomingSecretsEvents | OutgoingSecretsEvents;