
import { FileRecord } from '../types';

export interface FileChangeSet {
  added: File[];
  modified: File[];
  deletedIds: string[];
}

export class FileWatcherService {
  private directoryHandle: any | null = null; // FileSystemDirectoryHandle
  private isSupported: boolean;

  constructor() {
    this.isSupported = 'showDirectoryPicker' in window;
  }

  get isAPISupported() {
    return this.isSupported;
  }

  /**
   * Prompts user to select a directory and stores the handle.
   */
  async connect(): Promise<string> {
    if (!this.isSupported) {
      throw new Error('File System Access API is not supported in this browser.');
    }
    // @ts-ignore - TS might not know about showDirectoryPicker yet
    this.directoryHandle = await window.showDirectoryPicker();
    return this.directoryHandle.name;
  }

  /**
   * Recursively reads all files from the handle.
   */
  private async getFileMap(dirHandle: any, path: string = ''): Promise<Map<string, File>> {
    const fileMap = new Map<string, File>();

    for await (const entry of dirHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        // Manually patch webkitRelativePath because getFile() usually returns it empty
        Object.defineProperty(file, 'webkitRelativePath', {
          value: entryPath,
          writable: true 
        });
        fileMap.set(entryPath, file);
      } else if (entry.kind === 'directory') {
        const subMap = await this.getFileMap(entry, entryPath);
        subMap.forEach((val, key) => fileMap.set(key, val));
      }
    }

    return fileMap;
  }

  /**
   * Scans the connected directory and compares it with the current state (files list).
   * Returns a set of added, modified, and deleted files.
   */
  async scanForChanges(currentRecords: FileRecord[]): Promise<FileChangeSet> {
    if (!this.directoryHandle) {
      throw new Error('No directory connected.');
    }

    const currentDiskFiles = await this.getFileMap(this.directoryHandle, this.directoryHandle.name);
    
    const changes: FileChangeSet = {
      added: [],
      modified: [],
      deletedIds: []
    };

    // 1. Check for Added and Modified files
    for (const [path, file] of currentDiskFiles.entries()) {
      const existingRecord = currentRecords.find(r => r.isoMetadata?.originalPath === path);

      if (!existingRecord) {
        changes.added.push(file);
      } else {
        // Compare modification time and size
        if (existingRecord.lastModified !== file.lastModified || existingRecord.size !== file.size) {
           changes.modified.push(file);
        }
      }
    }

    // 2. Check for Deleted files
    // If a record exists in memory but not on disk map
    currentRecords.forEach(record => {
      // Only check files belonging to the connected root folder
      if (record.isoMetadata?.originalPath.startsWith(this.directoryHandle.name) && !currentDiskFiles.has(record.isoMetadata.originalPath)) {
        changes.deletedIds.push(record.id);
      }
    });

    return changes;
  }
}

export const fileWatcher = new FileWatcherService();
