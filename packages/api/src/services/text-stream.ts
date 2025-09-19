export interface TextStreamOptions {
  chunkSize?: number;
  delayMs?: number;
}

export class TextStreamService {
  async *streamText(
    text: string,
    options: TextStreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const { chunkSize = 5, delayMs = 20 } = options;

    const words = text.split(/(\s+)/);
    let buffer = '';

    for (let i = 0; i < words.length; i++) {
      buffer += words[i];

      if (buffer.length >= chunkSize || i === words.length - 1) {
        yield buffer;
        buffer = '';

        if (delayMs > 0 && i < words.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  async *streamTextByChars(
    text: string,
    options: TextStreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const { chunkSize = 3, delayMs = 10 } = options;

    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, Math.min(i + chunkSize, text.length));
      yield chunk;

      if (delayMs > 0 && i + chunkSize < text.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}

export const createTextStreamService = () => new TextStreamService();