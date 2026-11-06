import type { Judgment, RoundStats, StudyRound, StudySession } from '../types';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeWordKey(word: string): string {
  return word.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

export function compareLibraryNames(
  a: { name: string },
  b: { name: string },
): number {
  return a.name.localeCompare(b.name, 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortLibrariesByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort(compareLibraryNames);
}

export type LibrarySortMode = 'name' | 'updated' | 'created';

export interface LibrarySortable {
  name: string;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
  masteredCount: number;
}

export function isLibraryFullyMastered(library: {
  wordCount: number;
  masteredCount: number;
}): boolean {
  return library.wordCount > 0 && library.masteredCount >= library.wordCount;
}

export function sortLibrariesForDisplay<T extends LibrarySortable>(
  items: T[],
  mode: LibrarySortMode,
): T[] {
  return [...items].sort((a, b) => {
    const masteredA = isLibraryFullyMastered(a);
    const masteredB = isLibraryFullyMastered(b);
    if (masteredA !== masteredB) return masteredA ? 1 : -1;

    let result = 0;
    if (mode === 'updated') {
      result = b.updatedAt - a.updatedAt;
    } else if (mode === 'created') {
      result = b.createdAt - a.createdAt;
    }
    return result || compareLibraryNames(a, b);
  });
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function uniqueWords(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return '夜深啦';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)}`;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatFullDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp));
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

export function getRoundStats(round: StudyRound): RoundStats {
  const values = Object.values(round.judgments);
  const known = values.filter((value) => value === 'known').length;
  const unknown = values.filter((value) => value === 'unknown').length;
  const total = round.queue.length;
  const end = round.completedAt ?? Date.now();
  return {
    total,
    known,
    unknown,
    mastered: 0,
    accuracy: total > 0 ? Math.round((known / total) * 100) : 0,
    durationMs: Math.max(0, end - round.startedAt),
    completed: total > 0 && known + unknown === total,
  };
}

export function getRoundJudgment(
  round: StudyRound,
  wordId: string | undefined,
): Judgment | undefined {
  if (!wordId) return undefined;
  return round.judgments[wordId];
}

export function getCurrentRound(session: StudySession): StudyRound {
  return session.rounds[session.rounds.length - 1];
}

export function getSessionProgress(session: StudySession): {
  round: StudyRound;
  answered: number;
  total: number;
} {
  const round = getCurrentRound(session);
  return {
    round,
    answered: Object.keys(round.judgments).length,
    total: round.queue.length,
  };
}

export function getUnknownWordIds(round: StudyRound): string[] {
  return round.queue.filter((id) => round.judgments[id] === 'unknown');
}

export function toggleJudgment(value: Judgment): Judgment {
  return value === 'known' ? 'unknown' : 'known';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function safeFileName(input: string): string {
  return (
    input
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 60) || '词库'
  );
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}
