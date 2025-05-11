export class LlmRunner {
  constructor(public model: string) {}
  async *stream(_prompt: string) { /* noop */ }
  buffer() { return ''; }
}
