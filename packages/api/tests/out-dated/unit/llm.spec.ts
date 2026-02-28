import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as llmService from '../../../src/services/llm.js';

// Mock the ai library
vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  streamObject: vi.fn(),
  generateObject: vi.fn(),
}));

// Mock the providers
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn((model: string) => `anthropic:${model}`),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => `openai:${model}`)),
}));

describe('LLM Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('streamText', () => {
    it('should stream text data successfully', async () => {
      // Mock the streamText function from ai library
      const mockTextStream = {
        textStream: (async function* () {
          yield 'Hello';
          yield ' ';
          yield 'world';
          yield '!';
        })(),
      };

      const { streamText: aiStreamText } = await import('ai');
      vi.mocked(aiStreamText).mockResolvedValue(mockTextStream as any);

      // Call the service
      const result = await llmService.streamText({
        model: { provider: 'openai', model: 'gpt-4o' },
        prompt: 'test message',
        system: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 100,
      });

      // Verify the ai library was called with correct params
      expect(aiStreamText).toHaveBeenCalledWith({
        model: 'openai:gpt-4o',
        prompt: 'test message',
        system: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 100,
      });

      // Collect streamed text parts
      const textParts: string[] = [];
      for await (const textPart of result.textStream) {
        textParts.push(textPart);
      }

      // Verify we got the expected stream
      expect(textParts).toEqual(['Hello', ' ', 'world', '!']);
    });

    it('should handle streaming with OpenAI provider', async () => {
      // Mock streaming response
      const mockTextStream = {
        textStream: (async function* () {
          yield 'Streaming';
          yield ' text';
          yield ' response';
        })(),
      };

      const { streamText: aiStreamText } = await import('ai');
      vi.mocked(aiStreamText).mockResolvedValue(mockTextStream as any);

      // Test with the exact parameters from the user's example
      const result = await llmService.streamText({
        model: { provider: 'openai', model: 'gpt-4o' },
        prompt: 'test message',
        system: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 100,
      });

      // Simulate logging while streaming
      const streamedParts: string[] = [];
      for await (const textPart of result.textStream) {
        streamedParts.push(textPart);
        console.log('Streaming text to FE', { textPart });
      }

      expect(streamedParts).toEqual(['Streaming', ' text', ' response']);
      expect(streamedParts.join('')).toBe('Streaming text response');
    });

    it('should handle errors during streaming', async () => {
      const { streamText: aiStreamText } = await import('ai');
      vi.mocked(aiStreamText).mockRejectedValue(new Error('Stream failed'));

      await expect(
        llmService.streamText({
          model: { provider: 'openai', model: 'gpt-4o' },
          prompt: 'test',
        })
      ).rejects.toThrow('Stream failed');
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        llmService.streamText({
          model: { provider: 'unknown' as any, model: 'test' },
          prompt: 'test',
        })
      ).rejects.toThrow('Unknown provider: unknown');
    });
  });
});