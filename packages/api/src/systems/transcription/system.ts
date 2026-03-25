import { setup, fromCallback, spawnChild, fromPromise } from 'xstate';
import { fromSystem, systemBus, type MergeReceivable } from '@/core/helpers/event-helpers';
import { emit, safeEvents } from '@/core/helpers/actor-helpers';
import { z } from 'zod';
import { rootEvents } from '@/core/router/bus-emitter';
import { IncomingSystemEvents as IncomingSystemEventsType } from '@/core/router/events';
import { getApiKey } from '@/services/llm';
import type { TranscriptionProvider } from './types';
import { createLogger } from '@/core/helpers/debug/logger';

const logger = createLogger('transcription');

export const transcription = 'transcription' as const;

const busEvent = systemBus(transcription);

export const IncomingTranscriptionEvents = [
  busEvent('TRANSCRIBE', { audio: z.string(), mimeType: z.string() }),
] as const;

type TranscriptionInternalEvents =
  | { type: 'TRANSCRIBE'; audio: string; mimeType: string }
  | { type: 'TRANSCRIPTION_DONE'; text: string }
  | { type: 'TRANSCRIPTION_FAILED'; error: string };

type ReceivableEvents = MergeReceivable<typeof IncomingTranscriptionEvents, TranscriptionInternalEvents>;

export type OutgoingTranscriptionEvents =
  | { type: 'TRANSCRIPTION_RESULT'; text: string }
  | { type: 'TRANSCRIPTION_ERROR'; error: string };

export const TranscriptionSystemEvents = fromSystem(IncomingTranscriptionEvents)<OutgoingTranscriptionEvents, typeof transcription>();

const typeOf = safeEvents<ReceivableEvents>();

// --- Whisper Provider ---

function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-m4a': 'm4a',
  };
  return map[mimeType] || 'webm';
}

class WhisperProvider implements TranscriptionProvider {
  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const apiKey = getApiKey('openai');
    const ext = mimeToExtension(mimeType);
    const filename = `audio.${ext}`;

    // Build multipart/form-data manually
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    const parts: Buffer[] = [];

    // File part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    ));
    parts.push(audio);
    parts.push(Buffer.from('\r\n'));

    // Model part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    ));

    // Closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error (${response.status}): ${errorText}`);
    }

    const result = await response.json() as { text: string };
    return result.text;
  }
}

const provider: TranscriptionProvider = new WhisperProvider();

// --- State Machine ---

export const transcriptionSystem = setup({
  types: {
    events: {} as ReceivableEvents,
  },
  actors: {
    setupEventListeners: fromCallback(({ sendBack }) => {
      const incomingHandler = (event: IncomingSystemEventsType) => {
        if (event.systemId === 'transcription') {
          const { systemId, ...actualEvent } = event;
          sendBack(actualEvent);
        }
      };

      const onIncomingUnsub = rootEvents.onIncoming(incomingHandler);

      return () => {
        onIncomingUnsub();
      };
    }),
    transcribeAudio: fromPromise<string, { audio: string; mimeType: string }>(
      async ({ input }) => {
        const audioBuffer = Buffer.from(input.audio, 'base64');
        return provider.transcribe(audioBuffer, input.mimeType);
      }
    ),
  },
  actions: {
    setupEventListeners: spawnChild('setupEventListeners'),
    emitResult: (_, params: { text: string }) => {
      const wrapped = emit(transcription, {
        type: 'TRANSCRIPTION_RESULT',
        text: params.text,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    emitError: (_, params: { error: string }) => {
      const wrapped = emit(transcription, {
        type: 'TRANSCRIPTION_ERROR',
        error: params.error,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
  },
}).createMachine({
  id: transcription,
  initial: 'ready',
  entry: ['setupEventListeners'],
  states: {
    ready: {
      on: {
        TRANSCRIBE: {
          target: 'transcribing',
        },
      },
    },
    transcribing: {
      invoke: {
        src: 'transcribeAudio',
        input: ({ event }) => {
          const e = typeOf('TRANSCRIBE', event);
          return { audio: e.audio, mimeType: e.mimeType };
        },
        onDone: {
          target: 'ready',
          actions: {
            type: 'emitResult',
            params: ({ event }) => ({ text: event.output }),
          },
        },
        onError: {
          target: 'ready',
          actions: {
            type: 'emitError',
            params: ({ event }) => ({
              error: event.error instanceof Error ? event.error.message : String(event.error),
            }),
          },
        },
      },
    },
  },
});
