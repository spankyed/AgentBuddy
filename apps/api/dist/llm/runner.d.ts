export declare class LlmRunner {
    model: string;
    constructor(model: string);
    stream(_prompt: string, options?: {
        signal?: AbortSignal;
    }): AsyncGenerator<never, void, unknown>;
    buffer(): string;
}
//# sourceMappingURL=runner.d.ts.map