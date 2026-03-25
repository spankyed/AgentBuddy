export interface TranscriptionProvider {
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
}
