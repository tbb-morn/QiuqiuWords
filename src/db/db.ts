import Dexie, { type Table } from 'dexie';
import type { Library, StudySession, Word, WordProgress } from '../types';

export class QiuqiuDatabase extends Dexie {
  libraries!: Table<Library, string>;
  words!: Table<Word, string>;
  progress!: Table<WordProgress, string>;
  sessions!: Table<StudySession, string>;

  constructor() {
    super('qiuqiu-words');
    this.version(1).stores({
      libraries: 'id, name, createdAt, updatedAt',
      words: 'id, libraryId, wordKey, &[libraryId+wordKey], createdAt, updatedAt',
      progress: 'id, libraryId, wordId, &[libraryId+wordId], updatedAt',
      sessions: 'id, libraryId, status, createdAt, updatedAt',
    });
    // 词库合集导入允许保留同名重复单词，因此复合索引不再唯一。
    this.version(2).stores({
      libraries: 'id, name, createdAt, updatedAt',
      words: 'id, libraryId, wordKey, [libraryId+wordKey], createdAt, updatedAt',
      progress: 'id, libraryId, wordId, &[libraryId+wordId], updatedAt',
      sessions: 'id, libraryId, status, createdAt, updatedAt',
    });
    // 词库标签；旧词库自动补一个空标签数组。
    this.version(3)
      .stores({
        libraries: 'id, name, *tags, createdAt, updatedAt',
        words: 'id, libraryId, wordKey, [libraryId+wordKey], createdAt, updatedAt',
        progress: 'id, libraryId, wordId, &[libraryId+wordId], updatedAt',
        sessions: 'id, libraryId, status, createdAt, updatedAt',
      })
      .upgrade((transaction) =>
        transaction
          .table<Library, string>('libraries')
          .toCollection()
          .modify((library) => {
            if (!Array.isArray(library.tags)) library.tags = [];
          }),
      );
  }
}

export const db = new QiuqiuDatabase();

export function progressId(libraryId: string, wordId: string): string {
  return `${libraryId}::${wordId}`;
}
