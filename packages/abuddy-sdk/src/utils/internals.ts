// Redaction's host side: the key values this process has used, so logs can mask them. The package exports this module
// only under the @abuddy/source condition, so a pack can't reach it and replace what redaction treats as a secret.
import * as crypto from 'node:crypto';
import { setSecretValueMatcher } from './redact.ts';

const digests = new Set<string>();
const lengths = new Set<number>();
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * Lets redaction mask this value wherever it's printed, without keeping it: only its digest and its length are
 * recorded. The host's secrets store registers every value it encrypts or decrypts.
 *
 * @internal
 */
export function registerSecretValue(value: string): void {
  if (value === '') return;
  digests.add(sha256(value));
  lengths.add(value.length);
  // The length check comes first, so a run that can't be a stored value is never copied or hashed
  setSecretValueMatcher((text, from, to) => lengths.has(to - from) && digests.has(sha256(text.slice(from, to))));
}
