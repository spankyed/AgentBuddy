// Which providers the assistant needs a key for before it can call a model, and so before its first flow runs.
// The assistant is the threads feature's, and this is what it waits on.
export const REQUIRED_PROVIDERS = ['openai', 'anthropic'] as const;
