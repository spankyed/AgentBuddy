// Commands sent from main process to native helper via stdin
export type SpeechCommand =
  | { command: 'start'; lang?: string }
  | { command: 'stop' }

// Events sent from native helper to main process via stdout
export type SpeechEvent =
  | { event: 'ready' }
  | { event: 'started' }
  | { event: 'stopped' }
  | { event: 'partial'; text: string }
  | { event: 'final'; text: string }
  | { event: 'error'; code: string; message: string }
