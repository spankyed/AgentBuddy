/** A folder's entry */
export interface FileEntry {
  /** The entry's name, without its folder */
  name: string;
  isDirectory: boolean;
}

/** A path's size, modification time and kind */
export interface FileStat {
  /** In bytes */
  size: number;
  /** When the content last changed */
  mtime: Date;
  isDirectory: boolean;
  isFile: boolean;
}

/** Files and folders on the user's disk, read and written as UTF-8 text. Paths are absolute. */
export interface FilesystemService {
  /** Writes the file, creating its missing parent folders */
  writeFile(filePath: string, content: string): Promise<void>;
  /** The file's text; rejects when it doesn't exist */
  readFile(filePath: string): Promise<string>;
  /** Whether a file or folder is at the path */
  exists(filePath: string): Promise<boolean>;
  /** Creates the folder and its missing parents */
  mkdir(dirPath: string): Promise<void>;
  /** The folder's entries, in no particular order */
  readDir(dirPath: string): Promise<FileEntry[]>;
  /** Removes a file, or a folder with its contents; a missing path is not an error */
  remove(targetPath: string): Promise<void>;
  /** Moves a file or folder */
  rename(oldPath: string, newPath: string): Promise<void>;
  /** Rejects when nothing is at the path */
  stat(filePath: string): Promise<FileStat>;
}
