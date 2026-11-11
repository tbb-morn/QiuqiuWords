import 'fake-indexeddb/auto';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { WordContent } from '../types';
import { db } from './db';
import {
  answerCurrentWord,
  continueSession,
  correctCurrentWord,
  createLibrary,
  createWord,
  deleteLibraryCascade,
  deleteSession,
  deleteWord,
  getDashboardStats,
  getLibrariesWithCounts,
  getWordsWithProgress,
  goNextWord,
  goPreviousWord,
  importLibraryBundle,
  importWords,
  setWordMastered,
  startSession,
} from './repositories';

async function resetDatabase() {
  db.close();
  await db.delete();
  await db.open();
}

async function seedLibrary(name = '测试词库') {
  const library = await createLibrary({ name, description: '用于测试' });
  const alpha = await createWord(library.id, {
    word: 'alpha',
    definitions: [{ partOfSpeech: 'n.', meaning: '开端' }],
  });
  const beta = await createWord(library.id, {
    word: 'beta',
    definitions: [{ partOfSpeech: 'n.', meaning: '测试版' }],
  });
  const gamma = await createWord(library.id, {
    word: 'gamma',
    definitions: [{ partOfSpeech: 'n.', meaning: '伽马' }],
  });
  return { library, alpha, beta, gamma };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(() => {
  db.close();
});

describe('词库与单词', () => {
  it('创建单词时同时建立独立的学习状态，并阻止同名单词', async () => {
    const { library } = await seedLibrary();
    const words = await getWordsWithProgress(library.id);
    expect(words).toHaveLength(3);
    expect(words[0].progress).toMatchObject({ status: 'unseen', mastered: false });
    await expect(
      createWord(library.id, { word: 'ALPHA', definitions: [] }),
    ).rejects.toThrow('已经有');
  });

  it('创建词库时保存标签，并去掉重复和井号', async () => {
    const library = await createLibrary({
      name: '标签词库',
      description: '',
      tags: [' 考研 ', '#阅读', '考研', '阅读'],
    });
    expect(library.tags).toEqual(['考研', '阅读']);
  });

  it('导入时按词库内单词去重并支持跳过 / 更新', async () => {
    const { library } = await seedLibrary();
    const skipped = await importWords(
      library.id,
      [{ word: 'alpha', definitions: [{ partOfSpeech: 'n.', meaning: '新的含义' }] }],
      'skip',
    );
    expect(skipped).toEqual({ added: 0, updated: 0, skipped: 1 });
    const updated = await importWords(
      library.id,
      [{ word: 'alpha', definitions: [{ partOfSpeech: 'n.', meaning: '新的含义' }] }],
      'update',
    );
    expect(updated).toEqual({ added: 0, updated: 1, skipped: 0 });
    const words = await getWordsWithProgress(library.id);
    expect(words.find((word) => word.word === 'alpha')?.definitions[0]?.meaning).toBe('新的含义');
  });
});

describe('学习引擎', () => {
  it('第一轮排除已熟练掌握的单词，并复用进行中的会话', async () => {
    const { library, gamma } = await seedLibrary();
    await setWordMastered(gamma.id, true);
    const started = await startSession(library.id);
    expect(started.resumed).toBe(false);
    expect(started.session.rounds[0].queue).toHaveLength(2);
    expect(started.session.initialWordIds).not.toContain(gamma.id);
    const again = await startSession(library.id);
    expect(again.resumed).toBe(true);
    expect(again.session.id).toBe(started.session.id);
  });

  it('词库学习次数按真实学习会话计数，而不是轮数', async () => {
    const { library } = await seedLibrary();
    const { session } = await startSession(library.id);

    let libraries = await getLibrariesWithCounts();
    expect(libraries[0]?.studyCount).toBe(0);

    await answerCurrentWord(session.id, 'known');
    libraries = await getLibrariesWithCounts();
    expect(libraries[0]?.studyCount).toBe(1);
  });

  it('保存判断，切换位置，选错了会立即反转且不重复计数', async () => {
    const { library } = await seedLibrary();
    const { session } = await startSession(library.id);
    const firstId = session.rounds[0].queue[0];
    const answered = await answerCurrentWord(session.id, 'known');
    expect(answered.rounds[0].judgments[firstId]).toBe('known');
    expect(answered.rounds[0].view).toBe('detail');
    const corrected = await correctCurrentWord(session.id);
    expect(corrected.rounds[0].judgments[firstId]).toBe('unknown');
    expect(corrected.rounds[0].view).toBe('detail');
    const previous = await goPreviousWord(session.id);
    expect(previous.rounds[0].currentIndex).toBe(0);
    const next = await goNextWord(session.id);
    expect(next.rounds[0].currentIndex).toBe(1);
    expect(next.rounds[0].view).toBe('question');
    const progress = await db.progress.where('wordId').equals(firstId).first();
    expect(progress?.status).toBe('unknown');
    expect(Object.keys(corrected.rounds[0].judgments)).toHaveLength(1);
  });

  it('只把本轮 unknown 带入下一轮，全部认识后会话完成', async () => {
    const { library } = await seedLibrary();
    const { session } = await startSession(library.id);
    const [first, second, third] = session.rounds[0].queue;

    let current = await answerCurrentWord(session.id, 'known');
    current = await goNextWord(current.id);
    current = await answerCurrentWord(current.id, 'unknown');
    current = await goNextWord(current.id);
    current = await answerCurrentWord(current.id, 'known');
    current = await goNextWord(current.id);

    expect(current.stage).toBe('summary');
    expect(current.status).toBe('in_progress');
    expect(current.rounds[0].completedAt).toBeTypeOf('number');

    const nextRound = await continueSession(session.id);
    expect(nextRound.stage).toBe('studying');
    expect(nextRound.rounds).toHaveLength(2);
    expect(nextRound.rounds[1].queue).toEqual([second]);
    expect(nextRound.rounds[1].queue).not.toContain(first);
    expect(nextRound.rounds[1].queue).not.toContain(third);

    current = await answerCurrentWord(session.id, 'known');
    current = await goNextWord(session.id);
    expect(current.status).toBe('completed');
    expect(current.completedAt).toBeTypeOf('number');

    const stats = await getDashboardStats();
    expect(stats.completedSessionCount).toBe(1);
    expect(stats.completedRoundCount).toBe(2);
    expect(stats.studiedWordCount).toBe(3);
    expect(stats.repeatedWrongWords).toHaveLength(1);
    expect(stats.repeatedWrongWords[0]?.word.id).toBe(second);
    expect(stats.repeatedWrongWords[0]?.wrongCount).toBe(1);
  });

  it('删除学习记录只移除会话，不影响单词内容和学习状态', async () => {
    const { library } = await seedLibrary();
    const { session } = await startSession(library.id);
    const answeredId = session.rounds[0].queue[0];
    await answerCurrentWord(session.id, 'known');

    const wordsBefore = await db.words.count();
    const progressBefore = await db.progress.count();
    await deleteSession(session.id);

    expect(await db.sessions.count()).toBe(0);
    expect(await db.words.count()).toBe(wordsBefore);
    expect(await db.progress.count()).toBe(progressBefore);
    expect((await db.progress.where('wordId').equals(answeredId).first())?.status).toBe(
      'known',
    );
    const stats = await getDashboardStats();
    expect(stats.recentSessions).toHaveLength(0);
    expect(stats.studiedWordCount).toBe(0);
  });

  it('已熟练掌握按钮会加入结果并让未来学习彻底排除该词', async () => {
    const { library } = await seedLibrary();
    const { session } = await startSession(library.id);
    const queue = session.rounds[0].queue;
    const masteredId = queue[0];

    let current = await answerCurrentWord(session.id, 'known', { mastered: true });
    expect(current.rounds[0].judgments[masteredId]).toBe('known');
    for (let index = 1; index < queue.length; index += 1) {
      current = await goNextWord(current.id);
      current = await answerCurrentWord(session.id, 'known');
    }
    current = await goNextWord(current.id);
    expect(current.status).toBe('completed');

    const secondSession = await startSession(library.id);
    expect(secondSession.resumed).toBe(false);
    expect(secondSession.session.initialWordIds).not.toContain(masteredId);
    expect(secondSession.session.initialWordIds).toHaveLength(2);
  });

  it('未完成会话中禁止删除单词；删除词库会保留历史并中断会话', async () => {
    const { library, alpha } = await seedLibrary();
    const { session } = await startSession(library.id);
    await expect(deleteWord(alpha.id)).rejects.toThrow('正在未完成的学习会话里');

    await deleteLibraryCascade(library.id);
    expect(await db.libraries.get(library.id)).toBeUndefined();
    const archived = await db.sessions.get(session.id);
    expect(archived?.status).toBe('abandoned');
    expect(archived?.libraryDeleted).toBe(true);
    const stats = await getDashboardStats();
    expect(stats.recentSessions).toHaveLength(1);
    expect(stats.recentSessions[0]?.libraryName).toBe('测试词库');
  });
});

describe('多词库合集导入', () => {
  const content = (word: string): WordContent => ({
    word,
    phonetic: '',
    definitions: [{ partOfSpeech: 'n.', meaning: `${word} 的释义` }],
    examples: [],
    phrases: [],
    mnemonic: '',
    derivatives: [],
    synonyms: [],
    antonyms: [],
    note: '',
    customFields: [],
  });

  it('一次导入多个词库，并为所有单词建立独立的学习状态', async () => {
    const summary = await importLibraryBundle([
      {
        name: '晨间词',
        description: '早上学的词',
        tags: ['晨间', '自然'],
        words: [content('sunrise'), content('morning')],
      },
      {
        name: '夜间词',
        description: '晚上学的词',
        tags: ['夜间'],
        words: [content('moon'), content('star')],
      },
    ]);

    expect(summary.libraries).toHaveLength(2);
    expect(summary.totalWords).toBe(4);
    const libraries = await db.libraries.toArray();
    expect(libraries.map((library) => library.name).sort()).toEqual(['晨间词', '夜间词'].sort());
    expect(libraries.find((library) => library.name === '晨间词')?.tags).toEqual([
      '晨间',
      '自然',
    ]);
    const words = await db.words.toArray();
    const progress = await db.progress.toArray();
    expect(words).toHaveLength(4);
    expect(progress).toHaveLength(4);
    expect(progress.every((item) => item.status === 'unseen' && !item.mastered)).toBe(true);
    expect(words.find((word) => word.word === 'sunrise')?.definitions[0].meaning).toBe(
      'sunrise 的释义',
    );
  });

  it('批量导入词库时保留重复单词，不静默删除', async () => {
    const summary = await importLibraryBundle([
      {
        name: '保留重复',
        description: '',
        words: [content('alpha'), content('alpha'), content('ALPHA')],
      },
    ]);

    expect(summary.totalWords).toBe(3);
    const words = await db.words.toArray();
    expect(words).toHaveLength(3);
    expect(words.map((word) => word.word).sort()).toEqual(['ALPHA', 'alpha', 'alpha']);
  });

  it('再次导入同名词库时自动改名，绝不覆盖原词库', async () => {
    const bundle = [{ name: '同名', description: '', words: [content('alpha')] }];
    await importLibraryBundle(bundle);
    const second = await importLibraryBundle(bundle);

    expect(second.renamedCount).toBe(1);
    expect(second.libraries[0]?.name).toBe('同名（导入）');
    const libraries = await db.libraries.toArray();
    expect(libraries.map((library) => library.name).sort()).toEqual(['同名', '同名（导入）'].sort());
    expect(await db.words.count()).toBe(2);
  });

  it('同名词库选择覆盖时更新内容，并保留同名单词的学习状态', async () => {
    const first = await importLibraryBundle([
      {
        name: '可覆盖词库',
        description: '旧描述',
        tags: ['旧标签'],
        words: [content('alpha'), content('beta')],
      },
    ]);
    const libraryId = first.libraries[0].id;
    const oldWords = await getWordsWithProgress(libraryId);
    const oldAlpha = oldWords.find((word) => word.word === 'alpha');
    const oldBeta = oldWords.find((word) => word.word === 'beta');
    if (!oldAlpha || !oldBeta) throw new Error('测试词库创建失败');
    await setWordMastered(oldAlpha.id, true);

    const second = await importLibraryBundle(
      [
        {
          name: '可覆盖词库',
          description: '新描述',
          tags: ['新标签'],
          words: [content('alpha'), content('gamma')],
        },
      ],
      { onConflict: 'overwrite' },
    );

    expect(second.renamedCount).toBe(0);
    expect(second.overwrittenCount).toBe(1);
    expect(second.libraries[0]).toMatchObject({
      id: libraryId,
      name: '可覆盖词库',
      wordCount: 2,
    });
    expect(await db.libraries.count()).toBe(1);
    expect(await db.libraries.get(libraryId)).toMatchObject({
      description: '新描述',
      tags: ['新标签'],
    });

    const words = await getWordsWithProgress(libraryId);
    expect(words.map((word) => word.word).sort()).toEqual(['alpha', 'gamma']);
    expect(words.find((word) => word.word === 'alpha')?.progress.mastered).toBe(true);
    expect(words.find((word) => word.word === 'gamma')?.progress).toMatchObject({
      status: 'unseen',
      mastered: false,
    });
    expect(await db.words.get(oldBeta.id)).toBeUndefined();
    expect(await db.progress.where('wordId').equals(oldBeta.id).count()).toBe(0);
  });

  it('有进行中学习的同名词库不能覆盖', async () => {
    const { library } = await seedLibrary('学习中的词库');
    await startSession(library.id);

    await expect(
      importLibraryBundle(
        [
          {
            name: '学习中的词库',
            description: '新描述',
            words: [content('alpha')],
          },
        ],
        { onConflict: 'overwrite' },
      ),
    ).rejects.toThrow('不能覆盖');

    expect(await db.libraries.count()).toBe(1);
    expect((await db.libraries.get(library.id))?.description).toBe('用于测试');
  });

  it('空合集或没有有效单词的合集会被拒绝', async () => {
    await expect(importLibraryBundle([])).rejects.toThrow('没有可导入');
    await expect(
      importLibraryBundle([{ name: '空词库', description: '', words: [] }]),
    ).rejects.toThrow('没有包含有效单词');
  });
});
