// Commands sent from main process to native helper via stdin
export type SpeechCommand =
  | { command: 'start'; lang?: string }
  | { command: 'stop' }

// Events sent from native helper to main process via stdout
export type { SpeechEvent } from '../../../../../types/speech.js';
