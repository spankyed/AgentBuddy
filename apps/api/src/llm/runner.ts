export class LlmRunner {
  constructor(public model: string) {}
  async *stream(_prompt: string, options?: { signal?: AbortSignal }) { /* noop */ }
  buffer() { return ''; }
}
