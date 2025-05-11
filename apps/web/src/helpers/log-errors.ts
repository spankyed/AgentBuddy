export default function logErrors(actor: string) {
  return {
    error: (error: unknown) => {
      console.error(`${actor} State Error:`, error);
    }
  }
}
