export interface Library {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Definition {
  partOfSpeech: string;
  meaning: string;
}

export interface Example {
  en: string;
  zh: string;
}

export interface CustomField {
  label: string;
  value: string;
}

/** 用户在表单、CSV、JSON 中提供的单词内容（不含数据库元信息） */
export interface WordContent {
  word: string;
  phonetic: string;
  definitions: Definition[];
  examples: Example[];
  phrases: Example[];
  mnemonic: string;
  derivatives: string[];
  synonyms: string[];
  antonyms: string[];
  note: string;
  customFields: CustomField[];
}

export interface Word extends WordContent {
  id: string;
  libraryId: string;
  wordKey: string;
  createdAt: number;
  updatedAt: number;
}

export type WordStatus = 'unseen' | 'known' | 'unknown';

/** 学习状态与单词内容完全分开存储 */
export interface WordProgress {
  id: string;
  libraryId: string;
  wordId: string;
  status: WordStatus;
  mastered: boolean;
  updatedAt: number;
}

export type Judgment = 'known' | 'unknown';
export type RoundView = 'question' | 'detail';

export interface StudyRound {
  number: number;
  /** 本轮队列在创建时固定，顺序不再变化 */
  queue: string[];
  currentIndex: number;
  view: RoundView;
  /** 每个单词在本轮至多一个有效判断 */
  judgments: Record<string, Judgment>;
  startedAt: number;
  completedAt?: number;
}

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';
export type SessionStage = 'studying' | 'summary';

export interface StudySession {
  id: string;
  libraryId: string;
  /** 快照信息，词库删除后历史仍可读 */
  libraryName: string;
  status: SessionStatus;
  stage: SessionStage;
  /** 会话开始时的可学习单词 ID 快照 */
  initialWordIds: string[];
  rounds: StudyRound[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  endedAt?: number;
  libraryDeleted?: boolean;
}

export interface RoundStats {
  total: number;
  known: number;
  unknown: number;
  mastered: number;
  accuracy: number;
  durationMs: number;
  completed: boolean;
}

export interface LibraryWithCounts extends Library {
  wordCount: number;
  masteredCount: number;
  /** 有过真实判断的学习会话次数（不是轮数） */
  studyCount: number;
  activeSession?: StudySession;
}

export interface ActiveSessionView {
  session: StudySession;
  library: Library | undefined;
  currentRound: StudyRound;
  answered: number;
  total: number;
}

export interface WordWithProgress extends Word {
  progress: WordProgress;
}

export interface ImportWordIssue {
  row: number;
  message: string;
}

export interface ImportPreview {
  fileName: string;
  format: 'csv' | 'json';
  words: WordContent[];
  issues: ImportWordIssue[];
  duplicateInFile: number;
  invalidRows: number;
}

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
}

export type DuplicateStrategy = 'skip' | 'update';

export interface LibraryExportPackage {
  app: 'qiuqiu-words';
  version: 1;
  exportedAt: string;
  library: {
    name: string;
    description: string;
    tags?: string[];
  };
  words: WordContent[];
}

/** 多词库合集中的一个词库（不含 ID，导入时生成新记录） */
export interface LibraryBundleItem {
  name: string;
  description: string;
  tags?: string[];
  words: WordContent[];
}

/** 一次导出多个词库时使用的分享格式 */
export interface LibraryBundlePackage {
  app: 'qiuqiu-words';
  version: 2;
  kind: 'library-bundle';
  exportedAt: string;
  libraries: LibraryBundleItem[];
}

export interface LibraryBundlePreview {
  fileName: string;
  libraries: LibraryBundleItem[];
  issues: string[];
  totalWords: number;
  skippedWords: number;
}

export interface ImportedLibraryResult {
  id: string;
  originalName: string;
  name: string;
  wordCount: number;
}

export interface LibraryBundleImportSummary {
  libraries: ImportedLibraryResult[];
  totalWords: number;
  renamedCount: number;
}

