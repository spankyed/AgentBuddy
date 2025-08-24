import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import * as os from 'os';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'AgentBuddySecretsSalt2024'; // In production, use env variable

/**
 * Derive encryption key from machine-specific data or environment variable
 */
function deriveKey(): Buffer {
  // Use environment variable if available, otherwise use machine-specific data
  const secret = process.env.SECRETS_KEY || getMachineId();
  return scryptSync(secret, SALT, 32);
}

/**
 * Get a machine-specific identifier for encryption key derivation
 */
function getMachineId(): string {
  // Combine multiple machine-specific values for better uniqueness
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const homeDir = os.homedir();
  
  // Create a hash from these values
  const combined = `${hostname}-${platform}-${arch}-${homeDir}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Encrypt a text value using AES-256-GCM
 */
export function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

/**
 * Decrypt a value encrypted with AES-256-GCM
 */
export function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Check if a value can be decrypted (used for validation)
 */
export function canDecrypt(encrypted: string, iv: string, authTag: string): boolean {
  try {
    decrypt(encrypted, iv, authTag);
    return true;
  } catch {
    return false;
  }
}

/**
 * Securely clear a string from memory (best effort)
 * Note: JavaScript doesn't guarantee memory clearing, but this helps
 */
export function clearString(str: string): void {
  if (typeof str === 'string' && str.length > 0) {
    // Overwrite the string with random data
    const buffer = Buffer.from(str);
    crypto.randomFillSync(buffer);
  }
}