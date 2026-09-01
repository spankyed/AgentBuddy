declare module 'tar' {
  interface CreateOptions {
    gzip?: boolean;
    file?: string;
    cwd?: string;
    prefix?: string;
  }
  function create(options: CreateOptions, fileList: string[]): Promise<void>;
  export default { create };
}
