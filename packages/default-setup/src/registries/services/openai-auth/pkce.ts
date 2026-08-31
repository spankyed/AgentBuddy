/**
 * PKCE (Proof Key for Code Exchange) helpers for OAuth S256 flow.
 *
 * Matches Codex CLI's implementation:
 * - Verifier: 64 random bytes → base64url (no padding)
 * - Challenge: SHA256(verifier) → base64url (no padding)
 * - State: 32 random bytes → base64url (CSRF protection)
 */

import { randomBytes, createHash } from 'crypto'

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

/** Generate a PKCE code verifier (64 random bytes → base64url). */
export function generateVerifier(): string {
  return base64url(randomBytes(64))
}

/** Generate a PKCE code challenge from a verifier (SHA256 → base64url). */
export function generateChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

/** Generate a random state parameter for CSRF protection (32 bytes → base64url). */
export function generateState(): string {
  return base64url(randomBytes(32))
}
