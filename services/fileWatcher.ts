
import { FileRecord } from '../types';

export interface FileChangeSet {
  added: File[];
  modified: File[];
  deletedIds: string[];
}

export class FileWatcherService {
  /**
   * Simple stub for environments where FileSystem Access API is blocked.
   */
  async connect(): Promise<string> {
    return "نظام الملفات الافتراضي";
  }

  async scanForChanges(currentRecords: FileRecord[]): Promise<FileChangeSet> {
    return {
      added: [],
      modified: [],
      deletedIds: []
    };
  }
}

export const fileWatcher = new FileWatcherService();
