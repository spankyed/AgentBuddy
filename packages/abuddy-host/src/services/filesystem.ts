// services.filesystem: files and folders on the user's disk
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FilesystemService } from '@abuddy/sdk/services';

export const filesystem: FilesystemService = {
  async writeFile(filePath, content) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  },

  readFile: (filePath) => fs.readFile(filePath, 'utf-8'),

  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  async mkdir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  },

  async readDir(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  },

  async remove(targetPath) {
    await fs.rm(targetPath, { recursive: true, force: true });
  },

  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),

  async stat(filePath) {
    const stats = await fs.stat(filePath);
    return { size: stats.size, mtime: stats.mtime, isDirectory: stats.isDirectory(), isFile: stats.isFile() };
  },
};
