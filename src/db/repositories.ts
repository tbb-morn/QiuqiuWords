import { db, progressId } from './db';
import type {
  DuplicateStrategy,
  ImportSummary,
  Library,
  LibraryBundleImportSummary,
  LibraryBundleItem,
  LibraryWithCounts,
  RoundStats,
  StudyRound,
  StudySession,
  Word,
  WordContent,
  WordProgress,
  WordWithProgress,
} from '../types';
import { AppError } from '../lib/errors';
import {
  getRoundStats,
  getUnknownWordIds,
  normalizeWordKey,
  shuffle,
  createId,
  sortLibrariesByName,
} from '../lib/utils';
import { newWordRecord, normalizeWordContent, validateWordContent } from '../lib/words';
import { sanitizeLibraryTags, validateLibraryTags } from '../lib/libraryTags';

const now = () => Date.now();

/* -------------------------------------------------------------------------- */
/*                                  词库                                       */
/* -------------------------------------------------------------------------- */

export interface LibraryInput {
  name: string;
  description: string;
  tags?: string[];
}

function cleanLibraryInput(input: LibraryInput) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new AppError('给词库起一个名字吧', 'library_name_required');
  if (name.length > 40) throw new AppError('词库名称最多 40 个字符', 'library_name_too_long');
  if (description.length > 300) {
    throw new AppError('词库描述最多 300 个字符', 'library_description_too_long');
  }
  const tagError = validateLibraryTags(input.tags);
  if (tagError) throw new AppError(tagError, 'library_tags_invalid');
  return { name, description, tags: sanitizeLibraryTags(input.tags) };
}

export async function createLibrary(input: LibraryInput): Promise<Library> {
  const clean = cleanLibraryInput(input);
  const timestamp = now();
  const library: Library = {
    id: createId(),
    ...clean,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.libraries.add(library);
  return library;
}

export async function updateLibrary(id: string, input: LibraryInput): Promise<Library> {
  const clean = cleanLibraryInput(input);
  const library = await db.libraries.get(id);
  if (!library) throw new AppError('这个词库已经不存在了', 'library_missing');
  const updated: Library = { ...library, ...clean, updatedAt: now() };
  await db.libraries.put(updated);
  return updated;
}

export async function deleteLibrariesCascade(ids: string[]): Promise<number> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return 0;

  let deleted = 0;
  await db.transaction('rw', db.libraries, db.words, db.progress, db.sessions, async () => {
    const libraries = await db.libraries.bulkGet(uniqueIds);
    const existingIds = libraries
      .filter((library): library is Library => Boolean(library))
      .map((library) => library.id);
    if (existingIds.length === 0) return;
    deleted = existingIds.length;

    const sessions = await db.sessions.where('libraryId').anyOf(existingIds).toArray();
    const timestamp = now();
    if (sessions.length > 0) {
      const updatedSessions = sessions.map((session) => {
        if (session.status === 'in_progress') {
          return {
            ...session,
            status: 'abandoned' as const,
            endedAt: timestamp,
            libraryDeleted: true,
            updatedAt: timestamp,
          };
        }
        return { ...session, libraryDeleted: true };
      });
      await db.sessions.bulkPut(updatedSessions);
    }

    await db.progress.where('libraryId').anyOf(existingIds).delete();
    await db.words.where('libraryId').anyOf(existingIds).delete();
    await db.libraries.bulkDelete(existingIds);
  });
  return deleted;
}

export async function deleteLibraryCascade(id: string): Promise<void> {
  await deleteLibrariesCascade([id]);
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export function sessionHasLearningActivity(session: StudySession): boolean {
  return (
    session.status === 'completed' ||
    session.rounds.some((round) => Object.keys(round.judgments).length > 0)
  );
}

export async function getLibraryWithCounts(id: string): Promise<LibraryWithCounts | undefined> {
  const library = await db.libraries.get(id);
  if (!library) return undefined;
  const [words, progress, sessions] = await Promise.all([
    db.words.where('libraryId').equals(id).toArray(),
    db.progress.where('libraryId').equals(id).toArray(),
    db.sessions.where('libraryId').equals(id).toArray(),
  ]);
  const masteredCount = progress.filter((item) => item.mastered).length;
  const studyCount = sessions.filter(sessionHasLearningActivity).length;
  const activeSession = sessions.find((session) => session.status === 'in_progress');
  return { ...library, wordCount: words.length, masteredCount, studyCount, activeSession };
}

export async function getLibrariesWithCounts(): Promise<LibraryWithCounts[]> {
  const [libraries, words, progress, sessions] = await Promise.all([
    db.libraries.toArray(),
    db.words.toArray(),
    db.progress.toArray(),
    db.sessions.toArray(),
  ]);
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word.libraryId, (wordCounts.get(word.libraryId) ?? 0) + 1);
  }
  const masteredCounts = new Map<string, number>();
  for (const item of progress) {
    if (item.mastered) {
      masteredCounts.set(item.libraryId, (masteredCounts.get(item.libraryId) ?? 0) + 1);
    }
  }
  const studyCounts = new Map<string, number>();
  const activeByLibrary = new Map<string, StudySession>();
  for (const session of sessions) {
    if (session.status === 'in_progress') {
      activeByLibrary.set(session.libraryId, session);
    }
    if (sessionHasLearningActivity(session)) {
      studyCounts.set(session.libraryId, (studyCounts.get(session.libraryId) ?? 0) + 1);
    }
  }
  return sortLibrariesByName(libraries).map((library) => ({
    ...library,
    wordCount: wordCounts.get(library.id) ?? 0,
    masteredCount: masteredCounts.get(library.id) ?? 0,
    studyCount: studyCounts.get(library.id) ?? 0,
    activeSession: activeByLibrary.get(library.id),
  }));
}

/* -------------------------------------------------------------------------- */
/*                                  单词                                       */
/* -------------------------------------------------------------------------- */

async function ensureUniqueWordKey(
  libraryId: string,
  wordKey: string,
  exceptWordId?: string,
): Promise<void> {
  const existing = await db.words
    .where('[libraryId+wordKey]')
    .equals([libraryId, wordKey])
    .first();
  if (existing && existing.id !== exceptWordId) {
    throw new AppError(`词库中已经有「${existing.word}」啦`, 'duplicate_word');
  }
}

export async function createWord(libraryId: string, raw: Partial<WordContent>): Promise<Word> {
  const content = normalizeWordContent(raw);
  const validation = validateWordContent(content);
  if (validation) throw new AppError(validation, 'invalid_word');
  if (!(await db.libraries.get(libraryId))) {
    throw new AppError('这个词库已经不存在了', 'library_missing');
  }
  const word = newWordRecord(libraryId, content);
  await db.transaction('rw', db.words, db.progress, async () => {
    await ensureUniqueWordKey(libraryId, word.wordKey);
    await db.words.add(word);
    await db.progress.add({
      id: progressId(libraryId, word.id),
      libraryId,
      wordId: word.id,
      status: 'unseen',
      mastered: false,
      updatedAt: now(),
    });
  });
  return word;
}

export async function updateWord(wordId: string, raw: Partial<WordContent>): Promise<Word> {
  const existing = await db.words.get(wordId);
  if (!existing) throw new AppError('这个单词已经不存在了', 'word_missing');
  const content = normalizeWordContent(raw);
  const validation = validateWordContent(content);
  if (validation) throw new AppError(validation, 'invalid_word');
  const wordKey = normalizeWordKey(content.word);
  const updated: Word = {
    ...existing,
    ...content,
    wordKey,
    updatedAt: now(),
  };
  await db.transaction('rw', db.words, async () => {
    if (wordKey !== existing.wordKey) {
      await ensureUniqueWordKey(existing.libraryId, wordKey, existing.id);
    }
    await db.words.put(updated);
  });
  return updated;
}

export async function deleteWord(wordId: string): Promise<void> {
  const word = await db.words.get(wordId);
  if (!word) return;
  const sessions = await db.sessions.where('status').equals('in_progress').toArray();
  const isInActiveSession = sessions.some(
    (session) =>
      session.initialWordIds.includes(wordId) ||
      session.rounds.some((round) => round.queue.includes(wordId)),
  );
  if (isInActiveSession) {
    throw new AppError(
      '这个单词正在未完成的学习会话里。请先完成该会话，再来删除它。',
      'word_in_active_session',
    );
  }
  await db.transaction('rw', db.words, db.progress, async () => {
    await db.progress.delete(progressId(word.libraryId, word.id));
    await db.words.delete(word.id);
  });
}

export async function setWordMastered(wordId: string, mastered: boolean): Promise<WordProgress> {
  const word = await db.words.get(wordId);
  if (!word) throw new AppError('这个单词已经不存在了', 'word_missing');
  const id = progressId(word.libraryId, word.id);
  const progress = await db.progress.get(id);
  const updated: WordProgress = {
    id,
    libraryId: word.libraryId,
    wordId: word.id,
    status: mastered ? 'known' : (progress?.status ?? 'unseen'),
    mastered,
    updatedAt: now(),
  };
  await db.progress.put(updated);
  return updated;
}

export async function getWordsWithProgress(libraryId: string): Promise<WordWithProgress[]> {
  const [words, progress] = await Promise.all([
    db.words.where('libraryId').equals(libraryId).toArray(),
    db.progress.where('libraryId').equals(libraryId).toArray(),
  ]);
  const byWordId = new Map(progress.map((item) => [item.wordId, item]));
  return words
    .map((word) => {
      const state = byWordId.get(word.id) ?? {
        id: progressId(libraryId, word.id),
        libraryId,
        wordId: word.id,
        status: 'unseen' as const,
        mastered: false,
        updatedAt: word.updatedAt,
      };
      return { ...word, progress: state };
    })
    .sort((a, b) => a.word.localeCompare(b.word, 'en'));
}

export async function importWords(
  libraryId: string,
  rawWords: Partial<WordContent>[],
  strategy: DuplicateStrategy,
): Promise<ImportSummary> {
  if (!(await db.libraries.get(libraryId))) {
    throw new AppError('这个词库已经不存在了', 'library_missing');
  }

  const cleaned: WordContent[] = [];
  const seen = new Set<string>();
  for (const raw of rawWords) {
    const content = normalizeWordContent(raw);
    if (!content.word) continue;
    const key = normalizeWordKey(content.word);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(content);
  }

  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0 };
  await db.transaction('rw', db.words, db.progress, async () => {
    const existingWords = await db.words.where('libraryId').equals(libraryId).toArray();
    const existingByKey = new Map(existingWords.map((word) => [word.wordKey, word]));
    const timestamp = now();

    for (const content of cleaned) {
      const wordKey = normalizeWordKey(content.word);
      const existing = existingByKey.get(wordKey);
      if (existing) {
        if (strategy === 'skip') {
          summary.skipped += 1;
          continue;
        }
        const updated: Word = {
          ...existing,
          ...content,
          wordKey,
          updatedAt: timestamp,
        };
        await db.words.put(updated);
        summary.updated += 1;
        continue;
      }

      const record = newWordRecord(libraryId, content);
      await db.words.add(record);
      await db.progress.add({
        id: progressId(libraryId, record.id),
        libraryId,
        wordId: record.id,
        status: 'unseen',
        mastered: false,
        updatedAt: timestamp,
      });
      existingByKey.set(wordKey, record);
      summary.added += 1;
    }
  });

  return summary;
}

/* -------------------------------------------------------------------------- */
/*                                学习会话                                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                            多词库合集导入                                    */
/* -------------------------------------------------------------------------- */

function uniqueImportedLibraryName(baseName: string, usedNames: Set<string>): string {
  const base = (baseName.trim() || '导入词库').slice(0, 40);
  let candidate = base;
  let counter = 1;
  while (usedNames.has(candidate.toLocaleLowerCase('zh-CN'))) {
    const suffix = counter === 1 ? '（导入）' : `（导入 ${counter}）`;
    candidate = `${base.slice(0, Math.max(0, 40 - suffix.length)).trimEnd()}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase('zh-CN'));
  return candidate;
}

/**
 * 一次性把多个词库作为新词库导入。
 * - 同名词库不会覆盖已有内容，会自动添加（导入）后缀；
 * - 单词内容会重新生成 ID，不含学习进度与历史；
 * - 全部写入在同一个事务里，失败时不会留下半套词库。
 */
export async function importLibraryBundle(
  inputLibraries: LibraryBundleItem[],
): Promise<LibraryBundleImportSummary> {
  if (inputLibraries.length === 0) {
    throw new AppError('这个合集里没有可导入的词库', 'bundle_empty');
  }

  return db.transaction('rw', db.libraries, db.words, db.progress, async () => {
    const existingLibraries = await db.libraries.toArray();
    const usedNames = new Set(
      existingLibraries.map((library) => library.name.toLocaleLowerCase('zh-CN')),
    );
    const imported: LibraryBundleImportSummary['libraries'] = [];
    let totalWords = 0;
    let renamedCount = 0;
    const timestamp = now();

    for (const source of inputLibraries) {
      const originalName = source.name.trim().slice(0, 40) || '导入词库';
      const cleanedName = uniqueImportedLibraryName(originalName, usedNames);
      const description = source.description.trim().slice(0, 300);
      const tags = sanitizeLibraryTags(source.tags);

      const words: WordContent[] = [];
      for (const rawWord of source.words) {
        const content = normalizeWordContent(rawWord);
        if (validateWordContent(content)) continue;
        // 合集导入保留原始重复单词，不在这里静默去重。
        words.push(content);
      }
      if (words.length === 0) continue;

      const libraryId = createId();
      const library: Library = {
        id: libraryId,
        name: cleanedName,
        description,
        tags,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const wordRecords: Word[] = words.map((content) =>
        newWordRecord(libraryId, content),
      );
      const progressRecords: WordProgress[] = wordRecords.map((word) => ({
        id: progressId(libraryId, word.id),
        libraryId,
        wordId: word.id,
        status: 'unseen',
        mastered: false,
        updatedAt: timestamp,
      }));

      await db.libraries.add(library);
      await db.words.bulkAdd(wordRecords);
      await db.progress.bulkAdd(progressRecords);

      totalWords += wordRecords.length;
      if (cleanedName !== originalName) renamedCount += 1;
      imported.push({
        id: libraryId,
        originalName,
        name: cleanedName,
        wordCount: wordRecords.length,
      });
    }

    if (imported.length === 0) {
      throw new AppError('这个合集里没有包含有效单词的词库', 'bundle_empty');
    }

    return { libraries: imported, totalWords, renamedCount };
  });
}

export interface StartSessionResult {
  session: StudySession;
  resumed: boolean;
}

function assertStudySession(session: StudySession | undefined): StudySession {
  if (!session) throw new AppError('学习会话不存在了', 'session_missing');
  return session;
}

function currentRound(session: StudySession): StudyRound {
  const round = session.rounds[session.rounds.length - 1];
  if (!round) throw new AppError('学习轮次数据不完整', 'round_missing');
  return round;
}

export async function startSession(libraryId: string): Promise<StartSessionResult> {
  return db.transaction('rw', db.libraries, db.words, db.progress, db.sessions, async () => {
    const existing = await db.sessions
      .where('libraryId')
      .equals(libraryId)
      .filter((session) => session.status === 'in_progress')
      .first();
    if (existing) return { session: existing, resumed: true };

    const library = await db.libraries.get(libraryId);
    if (!library) throw new AppError('这个词库已经不存在了', 'library_missing');

    const [allWords, progress] = await Promise.all([
      db.words.where('libraryId').equals(libraryId).toArray(),
      db.progress.where('libraryId').equals(libraryId).toArray(),
    ]);
    if (allWords.length === 0) {
      throw new AppError('这个词库还没有单词，先添加几个吧', 'library_empty');
    }
    const masteredIds = new Set(progress.filter((item) => item.mastered).map((item) => item.wordId));
    const eligible = allWords.filter((word) => !masteredIds.has(word.id));
    if (eligible.length === 0) {
      throw new AppError('这个词库里的单词都已经是熟练掌握啦，去添加新单词吧', 'all_mastered');
    }

    const timestamp = now();
    const queue = shuffle(eligible.map((word) => word.id));
    const session: StudySession = {
      id: createId(),
      libraryId,
      libraryName: library.name,
      status: 'in_progress',
      stage: 'studying',
      initialWordIds: eligible.map((word) => word.id),
      rounds: [
        {
          number: 1,
          queue,
          currentIndex: 0,
          view: 'question',
          judgments: {},
          startedAt: timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.sessions.add(session);
    return { session, resumed: false };
  });
}

export async function getSession(sessionId: string): Promise<StudySession | undefined> {
  return db.sessions.get(sessionId);
}

export async function getActiveSessionsForLibrary(libraryId: string): Promise<StudySession[]> {
  return db.sessions
    .where('libraryId')
    .equals(libraryId)
    .filter((session) => session.status === 'in_progress')
    .toArray();
}

export async function getSessionWords(session: StudySession): Promise<Map<string, Word>> {
  const ids = [...new Set(session.rounds.flatMap((round) => round.queue))];
  const words = await db.words.bulkGet(ids);
  return new Map(words.filter((word): word is Word => Boolean(word)).map((word) => [word.id, word]));
}

export async function answerCurrentWord(
  sessionId: string,
  result: 'known' | 'unknown',
  options: { mastered?: boolean } = {},
): Promise<StudySession> {
  return db.transaction('rw', db.sessions, db.progress, db.words, async () => {
    const session = assertStudySession(await db.sessions.get(sessionId));
    if (session.status !== 'in_progress' || session.stage !== 'studying') {
      throw new AppError('当前不在答题状态', 'invalid_stage');
    }
    const round = currentRound(session);
    if (round.view !== 'question') throw new AppError('这个单词已经作答啦', 'already_answered');
    const wordId = round.queue[round.currentIndex];
    if (!wordId) throw new AppError('当前单词不存在', 'word_missing');
    if (round.judgments[wordId]) throw new AppError('这个单词已经作答啦', 'already_answered');
    const word = await db.words.get(wordId);
    if (!word) throw new AppError('这个单词已经被删除了', 'word_missing');

    const timestamp = now();
    const progressIdValue = progressId(session.libraryId, wordId);
    const previous = await db.progress.get(progressIdValue);
    const progress: WordProgress = {
      id: progressIdValue,
      libraryId: session.libraryId,
      wordId,
      status: options.mastered ? 'known' : result,
      mastered: options.mastered ? true : (previous?.mastered ?? false),
      updatedAt: timestamp,
    };

    const updatedRound: StudyRound = {
      ...round,
      judgments: { ...round.judgments, [wordId]: options.mastered ? 'known' : result },
      view: 'detail',
    };
    const updatedSession: StudySession = {
      ...session,
      rounds: [...session.rounds.slice(0, -1), updatedRound],
      updatedAt: timestamp,
    };

    await db.progress.put(progress);
    await db.sessions.put(updatedSession);
    return updatedSession;
  });
}

export async function correctCurrentWord(sessionId: string): Promise<StudySession> {
  return db.transaction('rw', db.sessions, db.progress, async () => {
    const session = assertStudySession(await db.sessions.get(sessionId));
    if (session.status !== 'in_progress' || session.stage !== 'studying') {
      throw new AppError('当前不在学习状态', 'invalid_stage');
    }
    const round = currentRound(session);
    const wordId = round.queue[round.currentIndex];
    if (!wordId) throw new AppError('当前单词不存在', 'word_missing');
    const current = round.judgments[wordId];
    if (!current) throw new AppError('这个单词还没有判断结果', 'judgment_missing');

    const timestamp = now();
    const next = current === 'known' ? 'unknown' : 'known';
    const progressIdValue = progressId(session.libraryId, wordId);
    await db.progress.put({
      id: progressIdValue,
      libraryId: session.libraryId,
      wordId,
      status: next,
      mastered: false,
      updatedAt: timestamp,
    });

    const updatedRound: StudyRound = {
      ...round,
      judgments: { ...round.judgments, [wordId]: next },
    };
    const updatedSession: StudySession = {
      ...session,
      rounds: [...session.rounds.slice(0, -1), updatedRound],
      updatedAt: timestamp,
    };
    await db.sessions.put(updatedSession);
    return updatedSession;
  });
}

export async function goPreviousWord(sessionId: string): Promise<StudySession> {
  return db.transaction('rw', db.sessions, async () => {
    const session = assertStudySession(await db.sessions.get(sessionId));
    if (session.status !== 'in_progress' || session.stage !== 'studying') {
      return session;
    }
    const round = currentRound(session);
    const target = Math.max(0, round.currentIndex - 1);
    if (target === round.currentIndex) return session;
    const updatedRound: StudyRound = {
      ...round,
      currentIndex: target,
      view: round.judgments[round.queue[target]] ? 'detail' : 'question',
    };
    const updatedSession: StudySession = {
      ...session,
      rounds: [...session.rounds.slice(0, -1), updatedRound],
      updatedAt: now(),
    };
    await db.sessions.put(updatedSession);
    return updatedSession;
  });
}

export async function goNextWord(sessionId: string): Promise<StudySession> {
  return db.transaction('rw', db.sessions, async () => {
    const session = assertStudySession(await db.sessions.get(sessionId));
    if (session.status !== 'in_progress' || session.stage !== 'studying') {
      return session;
    }
    const round = currentRound(session);
    if (round.currentIndex < round.queue.length - 1) {
      const target = round.currentIndex + 1;
      const updatedRound: StudyRound = {
        ...round,
        currentIndex: target,
        view: round.judgments[round.queue[target]] ? 'detail' : 'question',
      };
      const updatedSession: StudySession = {
        ...session,
        rounds: [...session.rounds.slice(0, -1), updatedRound],
        updatedAt: now(),
      };
      await db.sessions.put(updatedSession);
      return updatedSession;
    }

    const answered = Object.keys(round.judgments).length;
    if (answered < round.queue.length) {
      const firstUnanswered = round.queue.findIndex((id) => !round.judgments[id]);
      const updatedRound: StudyRound = {
        ...round,
        currentIndex: firstUnanswered >= 0 ? firstUnanswered : round.currentIndex,
        view: 'question',
      };
      const updatedSession: StudySession = {
        ...session,
        rounds: [...session.rounds.slice(0, -1), updatedRound],
        updatedAt: now(),
      };
      await db.sessions.put(updatedSession);
      return updatedSession;
    }

    const timestamp = now();
    const completedRound: StudyRound = { ...round, completedAt: timestamp };
    const unknown = getUnknownWordIds(completedRound);
    const updatedSession: StudySession = {
      ...session,
      rounds: [...session.rounds.slice(0, -1), completedRound],
      stage: 'summary',
      status: unknown.length === 0 ? 'completed' : 'in_progress',
      completedAt: unknown.length === 0 ? timestamp : undefined,
      updatedAt: timestamp,
    };
    await db.sessions.put(updatedSession);
    return updatedSession;
  });
}

export async function continueSession(sessionId: string): Promise<StudySession> {
  return db.transaction('rw', db.sessions, db.words, db.progress, async () => {
    const session = assertStudySession(await db.sessions.get(sessionId));
    if (session.stage !== 'summary' || session.status !== 'in_progress') {
      return session;
    }
    const round = currentRound(session);
    const unknownIds = getUnknownWordIds(round);
    const progress = await db.progress
      .where('libraryId')
      .equals(session.libraryId)
      .toArray();
    const mastered = new Set(progress.filter((item) => item.mastered).map((item) => item.wordId));
    const eligible = unknownIds.filter((wordId) => !mastered.has(wordId));

    if (eligible.length === 0) {
      const timestamp = now();
      const updatedSession: StudySession = {
        ...session,
        status: 'completed',
        completedAt: timestamp,
        updatedAt: timestamp,
      };
      await db.sessions.put(updatedSession);
      return updatedSession;
    }

    const timestamp = now();
    const nextRound: StudyRound = {
      number: round.number + 1,
      queue: shuffle(eligible),
      currentIndex: 0,
      view: 'question',
      judgments: {},
      startedAt: timestamp,
    };
    const updatedSession: StudySession = {
      ...session,
      rounds: [...session.rounds, nextRound],
      stage: 'studying',
      updatedAt: timestamp,
    };
    await db.sessions.put(updatedSession);
    return updatedSession;
  });
}

export function sessionRoundStats(round: StudyRound): RoundStats {
  return getRoundStats(round);
}

export async function getActiveSessionsWithLibraries(): Promise<
  Array<{ session: StudySession; library: Library | undefined }>
> {
  const sessions = await db.sessions
    .where('status')
    .equals('in_progress')
    .sortBy('updatedAt');
  const libraries = await db.libraries.bulkGet([...new Set(sessions.map((item) => item.libraryId))]);
  const libraryMap = new Map(
    libraries.filter((item): item is Library => Boolean(item)).map((item) => [item.id, item]),
  );
  return sessions
    .reverse()
    .map((session) => ({ session, library: libraryMap.get(session.libraryId) }));
}

/* -------------------------------------------------------------------------- */
/*                                  统计                                       */
/* -------------------------------------------------------------------------- */

export interface RepeatedWrongWord {
  word: Word;
  wrongCount: number;
  libraryName: string;
}

export interface DashboardStats {
  studiedWordCount: number;
  completedSessionCount: number;
  completedRoundCount: number;
  totalWords: number;
  totalLibraries: number;
  recentSessions: StudySession[];
  repeatedWrongWords: RepeatedWrongWord[];
  libraryWordCounts: Array<{
    library: Library;
    wordCount: number;
    masteredCount: number;
    studyCount: number;
  }>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [libraries, words, progress, sessions] = await Promise.all([
    db.libraries.toArray(),
    db.words.toArray(),
    db.progress.toArray(),
    db.sessions.toArray(),
  ]);

  const studiedWords = new Set<string>();
  const wrongCounts = new Map<string, number>();
  let completedRoundCount = 0;

  for (const session of sessions) {
    for (const round of session.rounds) {
      if (round.completedAt) completedRoundCount += 1;
      for (const [wordId, judgment] of Object.entries(round.judgments)) {
        studiedWords.add(wordId);
        if (judgment === 'unknown') {
          wrongCounts.set(wordId, (wrongCounts.get(wordId) ?? 0) + 1);
        }
      }
    }
  }

  const wordsById = new Map(words.map((word) => [word.id, word]));
  const librariesById = new Map(libraries.map((library) => [library.id, library]));
  const repeatedWrongWords: RepeatedWrongWord[] = [...wrongCounts.entries()]
    .filter(([wordId]) => wordsById.has(wordId))
    .map(([wordId, wrongCount]) => {
      const word = wordsById.get(wordId)!;
      return {
        word,
        wrongCount,
        libraryName: librariesById.get(word.libraryId)?.name ?? '已删除词库',
      };
    })
    .sort((a, b) => b.wrongCount - a.wrongCount || b.word.updatedAt - a.word.updatedAt);

  const studyCountsByLibrary = new Map<string, number>();
  for (const session of sessions) {
    if (sessionHasLearningActivity(session)) {
      studyCountsByLibrary.set(
        session.libraryId,
        (studyCountsByLibrary.get(session.libraryId) ?? 0) + 1,
      );
    }
  }

  const libraryWordCounts = sortLibrariesByName(libraries).map((library) => {
    const libraryWords = words.filter((word) => word.libraryId === library.id);
    const masteredCount = progress.filter(
      (item) => item.libraryId === library.id && item.mastered,
    ).length;
    return {
      library,
      wordCount: libraryWords.length,
      masteredCount,
      studyCount: studyCountsByLibrary.get(library.id) ?? 0,
    };
  });

  return {
    studiedWordCount: studiedWords.size,
    completedSessionCount: sessions.filter((session) => session.status === 'completed').length,
    completedRoundCount,
    totalWords: words.length,
    totalLibraries: libraries.length,
    recentSessions: [...sessions].sort(
      (a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt),
    ),
    repeatedWrongWords,
    libraryWordCounts,
  };
}
