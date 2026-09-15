// Service mocks last one test: the harness restores services after each, and inference fails until a test mocks it
import { describe, expect, it } from 'vitest';
import { mockInference, mockService } from '@abuddy/testing/harness';
import { services } from '#generated/services';

const scripted = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

describe('harness isolation between tests', () => {
  it('mocks a service and inference for this test', async () => {
    mockService('logger', scripted);
    mockInference('scripted');
    expect(services.logger).toBe(scripted);
    expect((await services.inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' })).text).toBe('scripted');
  });

  it('has the real logger, and inference that fails naming the fix, in the next test', async () => {
    expect(services.logger).not.toBe(scripted);
    await expect(services.inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' })).rejects.toThrow('mock inference with mockInference(reply)');
  });
});
