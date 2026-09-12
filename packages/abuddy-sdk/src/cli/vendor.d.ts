declare module 'tar' {
  interface CreateOptions {
    gzip?: boolean;
    file?: string;
    cwd?: string;
    prefix?: string;
  }
  interface ExtractOptions {
    cwd?: string;
    strip?: number;
    filter?: (path: string) => boolean;
  }
  function create(options: CreateOptions, fileList: string[]): Promise<void>;
  function extract(options: ExtractOptions): import('node:stream').Writable;
  export default { create, extract };
}

declare module 'semver' {
  function satisfies(version: string, range: string): boolean;
  function rcompare(a: string, b: string): number;
  function clean(version: string): string | null;
  function valid(version: string): string | null;
  export { satisfies, rcompare, clean, valid };
}
