// Mocks and the scripted model last one test: the harness restores services and the model after each
import { describe, expect, it } from 'vitest';
import { mockService } from '@abuddy/testing/harness';
import { fakeModel } from '@abuddy/sdk/testing';
import { generateText } from '@abuddy/sdk/inference';
import { services } from '#generated/services';

const scripted = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

describe('harness isolation between tests', () => {
  it('mocks a service and scripts the model for this test', async () => {
    mockService('logger', scripted);
    fakeModel('scripted');
    expect(services.logger).toBe(scripted);
    expect((await generateText({ model: { provider: 'openai', model: 'gpt' }, prompt: 'hi' })).text).toBe('scripted');
  });

  it('has the real service and no model in the next test', async () => {
    expect(services.logger).not.toBe(scripted);
    await expect(generateText({ model: { provider: 'openai', model: 'gpt' }, prompt: 'hi' })).rejects.toThrow('call fakeModel()');
  });
});
