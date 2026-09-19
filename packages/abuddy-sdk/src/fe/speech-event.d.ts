/** Events from the host's speech recognition, delivered through `window.electronAPI.speech`. */
export type SpeechEvent =
  | { event: 'ready' }
  | { event: 'started' }
  | { event: 'stopped' }
  | { event: 'partial'; text: string }
  | { event: 'final'; text: string }
  | { event: 'error'; code: string; message: string };
