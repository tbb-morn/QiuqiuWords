import { describe, expect, it } from 'vitest';
import {
  buildLibraryBundle,
  libraryBundleToJson,
  parseCsvImport,
  parseJsonImport,
  parseLibraryBundle,
  wordsToCsv,
  wordsToJson,
} from './transfer';
import type { WordContent } from '../types';

const complexWord: WordContent = {
  word: 'roundtrip',
  phonetic: '/raʊnd/',
  definitions: [
    { partOfSpeech: 'n.', meaning: '往返 | 一圈' },
    { partOfSpeech: 'v.', meaning: '绕行' },
  ],
  examples: [
    { en: 'A :: B in one sentence.', zh: '一句包含分隔符的中文。' },
    { en: 'Second example.', zh: '' },
  ],
  phrases: [{ en: 'round trip', zh: '往返旅行' }],
  mnemonic: 'round + trip',
  derivatives: ['roundness'],
  synonyms: ['circular'],
  antonyms: ['straight'],
  note: '包含 || 和 | 的备注',
  customFields: [
    { label: '出处', value: '一本书 || 第二章' },
    { label: '难度', value: '★★' },
  ],
};

describe('CSV 导入导出', () => {
  it('支持中文表头、友好语法与额外列', () => {
    const csv = [
      '单词,音标,释义,例句,巧记,自定义字段,来源',
      'apple,/ˈæpəl/,n. 苹果 | v. 珍视,An apple a day. :: 一天一苹果。||I like apples. :: 我喜欢苹果。,苹果圆圆的,场景 :: 早餐,阅读',
    ].join('\n');
    const preview = parseCsvImport(csv, 'words.csv');
    expect(preview.issues).toHaveLength(0);
    expect(preview.words).toHaveLength(1);
    const word = preview.words[0];
    expect(word.word).toBe('apple');
    expect(word.definitions).toEqual([
      { partOfSpeech: 'n.', meaning: '苹果' },
      { partOfSpeech: 'v.', meaning: '珍视' },
    ]);
    expect(word.examples).toHaveLength(2);
    expect(word.customFields).toContainEqual({ label: '场景', value: '早餐' });
    expect(word.customFields).toContainEqual({ label: '来源', value: '阅读' });
  });

  it('会跳过没有英文单词的行并统计重复', () => {
    const csv = [
      'word,definitions',
      'one,一',
      'one,又一个',
      ',没有单词',
      'two,二',
    ].join('\n');
    const preview = parseCsvImport(csv, 'words.csv');
    expect(preview.words.map((word) => word.word)).toEqual(['one', 'two']);
    expect(preview.duplicateInFile).toBe(1);
    expect(preview.invalidRows).toBe(1);
    expect(preview.issues.some((issue) => issue.row === 4)).toBe(true);
  });

  it('CSV 导出再导入可以无损保留分隔符和自定义字段', () => {
    const csv = wordsToCsv([complexWord]);
    const preview = parseCsvImport(csv, 'roundtrip.csv');
    expect(preview.words).toHaveLength(1);
    expect(preview.words[0]).toEqual(complexWord);
  });
});

describe('JSON 导入导出', () => {
  it('支持导出包与裸单词数组', () => {
    const json = wordsToJson({ name: '测试', description: '小词库' }, [complexWord]);
    const packagePreview = parseJsonImport(json, 'library.json');
    expect(packagePreview.words).toEqual([complexWord]);

    const arrayPreview = parseJsonImport(JSON.stringify([{ word: 'hello', definitions: ['问候'] }]), 'words.json');
    expect(arrayPreview.words[0]?.word).toBe('hello');
    expect(arrayPreview.words[0]?.definitions[0]?.meaning).toBe('问候');
  });

  it('给出 JSON 格式与字段错误提示', () => {
    expect(parseJsonImport('{broken', 'bad.json').issues[0]?.message).toContain('格式不正确');
    const missing = parseJsonImport(JSON.stringify({ hello: 'world' }), 'missing.json');
    expect(missing.issues[0]?.message).toContain('没有找到单词数组');
    const invalid = parseJsonImport(JSON.stringify([{ word: '' }, 'nope']), 'invalid.json');
    expect(invalid.invalidRows).toBe(2);
  });
});

describe('多词库合集', () => {
  const secondWord: WordContent = {
    ...complexWord,
    word: 'simple',
    definitions: [{ partOfSpeech: 'adj.', meaning: '简单的' }],
  };

  it('多个词库可以导出成一个 JSON，并完整解析回来', () => {
    const json = libraryBundleToJson([
      {
        library: { name: '基础词', description: '第一个词库', tags: ['考研', '阅读'] },
        words: [complexWord],
      },
      { library: { name: '日常词', description: '第二个词库' }, words: [secondWord] },
    ]);
    const raw = JSON.parse(json) as Record<string, unknown>;
    expect(raw.kind).toBe('library-bundle');
    expect(raw.version).toBe(2);

    const preview = parseLibraryBundle(json, '合集.json');
    expect(preview.issues).toHaveLength(0);
    expect(preview.libraries).toHaveLength(2);
    expect(preview.totalWords).toBe(2);
    expect(preview.libraries[0]).toMatchObject({
      name: '基础词',
      description: '第一个词库',
      tags: ['考研', '阅读'],
    });
    expect(preview.libraries[1].words[0].word).toBe('simple');
  });

  it('也兼容单库导出的 JSON', () => {
    const json = wordsToJson(
      { name: '单独词库', description: '', tags: ['雅思'] },
      [complexWord],
    );
    const preview = parseLibraryBundle(json, '单库.json');
    expect(preview.libraries).toHaveLength(1);
    expect(preview.libraries[0].name).toBe('单独词库');
    expect(preview.libraries[0].tags).toEqual(['雅思']);
    expect(preview.totalWords).toBe(1);
  });

  it('会保留重复单词，只跳过无效单词和空词库', () => {
    const libraryBundle = buildLibraryBundle([
      { library: { name: '带问题的词库', description: '' }, words: [] },
    ]);
    const raw = JSON.parse(JSON.stringify(libraryBundle)) as {
      libraries: Array<{ words: unknown[] }>;
    };
    raw.libraries[0].words = [
      { word: 'alpha', definitions: ['开端'] },
      { word: 'ALPHA', definitions: ['重复'] },
      { word: '' },
      'not-an-object',
    ];
    const preview = parseLibraryBundle(JSON.stringify(raw), '有问题.json');
    expect(preview.libraries).toHaveLength(1);
    expect(preview.totalWords).toBe(2);
    expect(preview.skippedWords).toBe(2);
    expect(preview.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('错误 JSON 和没有词库的文件会给出明确提示', () => {
    expect(parseLibraryBundle('{broken', 'bad.json').issues[0]).toContain('格式不正确');
    const missing = parseLibraryBundle(JSON.stringify({ hello: 'world' }), 'missing.json');
    expect(missing.issues[0]).toContain('没有找到词库数组');
  });
});
