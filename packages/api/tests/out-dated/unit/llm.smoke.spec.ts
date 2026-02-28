import 'dotenv/config';
import { describe, expect, it, beforeAll } from 'vitest';
import * as llmService from '../../../src/services/llm.js';

describe('LLM Service - Smoke Tests', () => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  
  if (!hasApiKey) {
    console.warn('⚠️  OPENAI_API_KEY not found. Skipping live API tests.');
  } else {
    console.log('✅ OPENAI_API_KEY found! Running live tests...');
  }

  describe('streamText - Live API', () => {
    it.skipIf(!hasApiKey)('should stream real text from OpenAI', async () => {
      console.log('🔴 LIVE TEST: Calling OpenAI API...');
      
      const result = await llmService.streamText({
        model: { provider: 'openai', model: 'gpt-4o-mini' }, // Using mini model to reduce costs
        prompt: 'Say "Hello streaming world!" and nothing else.',
        system: 'You are a helpful assistant. Respond exactly as requested.',
        temperature: 0, // Deterministic response
        maxTokens: 10,
      });

      expect(result).toBeDefined();
      expect(result.textStream).toBeDefined();

      // Collect all streamed parts
      const streamedParts: string[] = [];
      console.log('📡 Streaming response:');
      
      for await (const textPart of result.textStream) {
        streamedParts.push(textPart);
        console.log(`  Chunk ${streamedParts.length}: "${textPart}"`);
      }

      // Verify we got multiple chunks (streaming behavior)
      console.log(`✅ Received ${streamedParts.length} chunks`);
      expect(streamedParts.length).toBeGreaterThan(0);
      
      // Verify the complete response
      const fullResponse = streamedParts.join('');
      console.log(`📝 Full response: "${fullResponse}"`);
      expect(fullResponse.toLowerCase()).toContain('hello');
      expect(fullResponse.toLowerCase()).toContain('streaming');
    });

    it.skipIf(!hasApiKey)('should handle longer streaming responses', async () => {
      console.log('🔴 LIVE TEST: Testing longer streaming response...');
      
      const result = await llmService.streamText({
        model: { provider: 'openai', model: 'gpt-4o-mini' },
        prompt: 'Count from 1 to 5, one number per line.',
        system: 'You are a helpful assistant. Output only the numbers as requested.',
        temperature: 0,
        maxTokens: 20,
      });

      const streamedParts: string[] = [];
      let chunkCount = 0;
      
      for await (const textPart of result.textStream) {
        chunkCount++;
        streamedParts.push(textPart);
        console.log(`  Chunk ${chunkCount}: "${textPart.replace(/\n/g, '\\n')}"`);
      }

      const fullResponse = streamedParts.join('');
      console.log(`✅ Streamed ${chunkCount} chunks`);
      console.log(`📝 Full response:\n${fullResponse}`);
      
      // Verify streaming happened (multiple chunks)
      expect(chunkCount).toBeGreaterThan(1);
      
      // Verify content
      expect(fullResponse).toMatch(/1/);
      expect(fullResponse).toMatch(/2/);
      expect(fullResponse).toMatch(/3/);
    });

    it.skipIf(!hasApiKey)('should stream with exact parameters from user example', async () => {
      console.log('🔴 LIVE TEST: Using exact user parameters...');
      
      const message = 'What is 2+2? Reply with just the number.';
      
      const result = await llmService.streamText({
        model: { provider: 'openai', model: 'gpt-4o' },
        prompt: message,
        system: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 100,
      });

      console.log('📡 Streaming with user parameters:');
      const streamedParts: string[] = [];
      
      for await (const textPart of result.textStream) {
        console.log('Streaming text to FE', { textPart });
        streamedParts.push(textPart);
      }

      const fullResponse = streamedParts.join('');
      console.log(`✅ Complete response: "${fullResponse}"`);
      
      expect(streamedParts.length).toBeGreaterThan(0);
      expect(fullResponse).toBeTruthy();
      // The response should contain "4"
      expect(fullResponse).toMatch(/4/);
    });

  });
});