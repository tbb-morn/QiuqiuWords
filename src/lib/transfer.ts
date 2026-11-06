import Papa from 'papaparse';
import type {
  CustomField,
  Definition,
  Example,
  ImportPreview,
  ImportWordIssue,
  Library,
  LibraryBundleItem,
  LibraryBundlePackage,
  LibraryBundlePreview,
  LibraryExportPackage,
  Word,
  WordContent,
} from '../types';

import { normalizeWordContent } from './words';
import { normalizeWordKey } from './utils';
import { sanitizeLibraryTags } from './libraryTags';

/* -------------------------------------------------------------------------- */
/*                                  表头映射                                   */
/* -------------------------------------------------------------------------- */

const HEADER_ALIASES: Record<string, string[]> = {
  word: ['word', '单词', '英文', '英文单词', 'english', 'term'],
  phonetic: ['phonetic', '音标', 'ipa'],
  definitions: ['definitions', 'definition', '释义', '词性释义', '中文释义', 'meaning', '中文'],
  partOfSpeech: ['partofspeech', 'pos', '词性'],
  examples: ['examples', 'example', '例句'],
  phrases: ['phrases', 'phrase', '词组', '短语'],
  mnemonic: ['mnemonic', '巧记', '口诀', '巧记口诀', 'memorytip'],
  derivatives: ['derivatives', 'derivative', '派生词', '派生'],
  synonyms: ['synonyms', 'synonym', '同义词'],
  antonyms: ['antonyms', 'antonym', '反义词'],
  note: ['note', 'notes', '备注', '个人备注'],
  customFields: ['customfields', 'customfield', '自定义字段', '自定义'],
};

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_-]/g, '');
}

const HEADER_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
  for (const alias of aliases) {
    HEADER_LOOKUP.set(normalizeHeader(alias), canonical);
  }
}

function canonicalHeader(header: string): string | null {
  return HEADER_LOOKUP.get(normalizeHeader(header)) ?? null;
}

/* -------------------------------------------------------------------------- */
/*                              结构化单元格解析                                */
/* -------------------------------------------------------------------------- */

function tryJson(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

const POS_PATTERN =
  /^((?:(?:n|v|vt|vi|adj|adv|prep|pron|conj|det|num|interj|aux|art|abbr|pl|phr|sing)\.\s*(?:[/&]\s*)?)+)\s*(.+)$/i;

function splitLoose(value: string): string[] {
  return value
    .split(/\r?\n|[|｜]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseDefinitions(value: string): Definition[] {
  if (!value.trim()) return [];
  const json = tryJson(value);
  if (Array.isArray(json)) {
    return normalizeWordContent({ word: '_', definitions: json }).definitions;
  }
  return splitLoose(value)
    .map((entry) => {
      if (entry.includes('::')) {
        const [partOfSpeech, ...rest] = entry.split('::');
        return {
          partOfSpeech: partOfSpeech.trim(),
          meaning: rest.join('::').trim(),
        };
      }
      const match = entry.match(POS_PATTERN);
      if (match) {
        return {
          partOfSpeech: match[1].trim(),
          meaning: match[2].trim(),
        };
      }
      return { partOfSpeech: '', meaning: entry };
    })
    .filter((definition) => definition.meaning);
}

export function parseExamples(value: string): Example[] {
  if (!value.trim()) return [];
  const json = tryJson(value);
  if (Array.isArray(json)) {
    return normalizeWordContent({ word: '_', examples: json }).examples;
  }
  return value
    .split(/\|\||\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('::');
      if (separator === -1) return { en: entry, zh: '' };
      return {
        en: entry.slice(0, separator).trim(),
        zh: entry.slice(separator + 2).trim(),
      };
    })
    .filter((example) => example.en || example.zh);
}

function parseStringArray(value: string): string[] {
  if (!value.trim()) return [];
  const json = tryJson(value);
  if (Array.isArray(json)) {
    return normalizeWordContent({ word: '_', derivatives: json }).derivatives;
  }
  return [...new Set(value.split(/[|｜]/).map((item) => item.trim()).filter(Boolean))];
}

function parseCustomFields(value: string): CustomField[] {
  if (!value.trim()) return [];
  const json = tryJson(value);
  if (Array.isArray(json)) {
    return normalizeWordContent({ word: '_', customFields: json }).customFields;
  }
  return value
    .split(/\|\||\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('::');
      if (separator === -1) return { label: '自定义', value: entry };
      return {
        label: entry.slice(0, separator).trim(),
        value: entry.slice(separator + 2).trim(),
      };
    })
    .filter((item) => item.label || item.value);
}

/* -------------------------------------------------------------------------- */
/*                                  CSV 导入                                   */
/* -------------------------------------------------------------------------- */

function isBlankRow(row: Record<string, string>): boolean {
  return Object.values(row).every((value) => !String(value ?? '').trim());
}

export function parseCsvImport(text: string, fileName: string): ImportPreview {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const issues: ImportWordIssue[] = [];
  const words: WordContent[] = [];
  const seen = new Set<string>();
  let duplicateInFile = 0;
  let invalidRows = 0;

  const headers = result.meta.fields ?? [];
  if (headers.length === 0) {
    return {
      fileName,
      format: 'csv',
      words: [],
      issues: [{ row: 0, message: '没有找到表头，请使用模板中的列名' }],
      duplicateInFile: 0,
      invalidRows: 0,
    };
  }
  if (!headers.some((header) => canonicalHeader(header) === 'word')) {
    issues.push({ row: 1, message: '缺少必填列 word（英文单词）' });
  }

  result.data.forEach((rawRow, index) => {
    if (isBlankRow(rawRow)) return;
    const rowNumber = index + 2;
    const values = new Map<string, string>();
    const extraFields: CustomField[] = [];

    for (const [rawHeader, rawValue] of Object.entries(rawRow)) {
      const value = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
      const canonical = canonicalHeader(rawHeader);
      if (canonical) {
        values.set(canonical, value);
      } else if (value.trim()) {
        extraFields.push({ label: rawHeader.trim(), value: value.trim() });
      }
    }

    const wordText = (values.get('word') ?? '').trim();
    if (!wordText) {
      invalidRows += 1;
      issues.push({ row: rowNumber, message: '英文单词为空，已跳过这一行' });
      return;
    }

    const definitionsValue = values.get('definitions') ?? '';
    const separatePos = (values.get('partOfSpeech') ?? '').trim();
    let definitions = parseDefinitions(definitionsValue);
    if (separatePos && definitionsValue.trim()) {
      definitions = definitions.map((definition, index) =>
        index === 0 && !definition.partOfSpeech
          ? { ...definition, partOfSpeech: separatePos }
          : definition,
      );
    }

    const content = normalizeWordContent({
      word: wordText,
      phonetic: values.get('phonetic') ?? '',
      definitions,
      examples: parseExamples(values.get('examples') ?? ''),
      phrases: parseExamples(values.get('phrases') ?? ''),
      mnemonic: values.get('mnemonic') ?? '',
      derivatives: parseStringArray(values.get('derivatives') ?? ''),
      synonyms: parseStringArray(values.get('synonyms') ?? ''),
      antonyms: parseStringArray(values.get('antonyms') ?? ''),
      note: values.get('note') ?? '',
      customFields: [
        ...parseCustomFields(values.get('customFields') ?? ''),
        ...extraFields,
      ],
    });

    if (!content.word) {
      invalidRows += 1;
      issues.push({ row: rowNumber, message: '英文单词为空，已跳过这一行' });
      return;
    }
    const key = normalizeWordKey(content.word);
    if (seen.has(key)) {
      duplicateInFile += 1;
      return;
    }
    seen.add(key);
    words.push(content);
  });

  for (const error of result.errors.slice(0, 5)) {
    issues.push({
      row: (error.row ?? 0) + 2,
      message: `CSV 格式提示：${error.message}`,
    });
  }

  return { fileName, format: 'csv', words, issues, duplicateInFile, invalidRows };
}

/* -------------------------------------------------------------------------- */
/*                                 JSON 导入                                   */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapJsonWord(raw: Record<string, unknown>): Partial<WordContent> {
  return {
    word: String(raw.word ?? raw.term ?? raw.english ?? raw['英文'] ?? raw['单词'] ?? ''),
    phonetic: String(raw.phonetic ?? raw.ipa ?? raw['音标'] ?? ''),
    definitions: (raw.definitions ?? raw.definition ?? raw.meanings ?? raw['释义']) as
      | Definition[]
      | undefined,
    examples: (raw.examples ?? raw.example ?? raw['例句']) as Example[] | undefined,
    phrases: (raw.phrases ?? raw.phrase ?? raw['词组']) as Example[] | undefined,
    mnemonic: String(raw.mnemonic ?? raw.memoryTip ?? raw['巧记'] ?? ''),
    derivatives: (raw.derivatives ?? raw['派生词']) as string[] | undefined,
    synonyms: (raw.synonyms ?? raw['同义词']) as string[] | undefined,
    antonyms: (raw.antonyms ?? raw['反义词']) as string[] | undefined,
    note: String(raw.note ?? raw.notes ?? raw['备注'] ?? ''),
    customFields: (raw.customFields ?? raw.custom_fields ?? raw['自定义字段']) as
      | CustomField[]
      | undefined,
  };
}

export function parseJsonImport(text: string, fileName: string): ImportPreview {
  const issues: ImportWordIssue[] = [];
  const words: WordContent[] = [];
  const seen = new Set<string>();
  let duplicateInFile = 0;
  let invalidRows = 0;

  let payload: unknown;
  try {
    payload = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return {
      fileName,
      format: 'json',
      words: [],
      issues: [{ row: 0, message: 'JSON 文件格式不正确，请检查逗号、引号与括号' }],
      duplicateInFile: 0,
      invalidRows: 0,
    };
  }

  let sourceWords: unknown[] = [];
  if (Array.isArray(payload)) {
    sourceWords = payload;
  } else {
    const record = asRecord(payload);
    if (record && Array.isArray(record.words)) {
      sourceWords = record.words;
    } else {
      return {
        fileName,
        format: 'json',
        words: [],
        issues: [
          {
            row: 0,
            message: '没有找到单词数组。JSON 可以是单词数组，或包含 words 数组的导出文件。',
          },
        ],
        duplicateInFile: 0,
        invalidRows: 0,
      };
    }
  }

  sourceWords.forEach((item, index) => {
    const rowNumber = index + 1;
    const record = asRecord(item);
    if (!record) {
      invalidRows += 1;
      issues.push({ row: rowNumber, message: '这一项不是有效的单词对象' });
      return;
    }
    const content = normalizeWordContent(mapJsonWord(record));
    if (!content.word) {
      invalidRows += 1;
      issues.push({ row: rowNumber, message: '缺少英文单词字段，已跳过' });
      return;
    }
    const key = normalizeWordKey(content.word);
    if (seen.has(key)) {
      duplicateInFile += 1;
      return;
    }
    seen.add(key);
    words.push(content);
  });

  return { fileName, format: 'json', words, issues, duplicateInFile, invalidRows };
}

export function parseImportFile(fileName: string, text: string): ImportPreview {
  const lowerName = fileName.toLocaleLowerCase('en-US');
  const isJson =
    lowerName.endsWith('.json') ||
    (!lowerName.endsWith('.csv') && /^\s*[[{]/.test(text));
  return isJson ? parseJsonImport(text, fileName) : parseCsvImport(text, fileName);
}

/* -------------------------------------------------------------------------- */
/*                                  导出                                       */
/* -------------------------------------------------------------------------- */

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function encodeDefinitions(definitions: Definition[]): string {
  if (definitions.length === 0) return '';
  const friendly = definitions
    .map((item) => [item.partOfSpeech, item.meaning].filter(Boolean).join(' '))
    .join(' | ');
  return same(parseDefinitions(friendly), definitions) ? friendly : JSON.stringify(definitions);
}

function encodeExamples(examples: Example[]): string {
  if (examples.length === 0) return '';
  const friendly = examples
    .map((item) => [item.en, item.zh].filter(Boolean).join(' :: '))
    .join(' || ');
  return same(parseExamples(friendly), examples) ? friendly : JSON.stringify(examples);
}

function encodeStringArray(items: string[]): string {
  if (items.length === 0) return '';
  const friendly = items.join(' | ');
  return same(parseStringArray(friendly), items) ? friendly : JSON.stringify(items);
}

function encodeCustomFields(fields: CustomField[]): string {
  if (fields.length === 0) return '';
  const friendly = fields.map((item) => `${item.label} :: ${item.value}`).join(' || ');
  return same(parseCustomFields(friendly), fields) ? friendly : JSON.stringify(fields);
}

const CSV_COLUMNS = [
  'word',
  'phonetic',
  'definitions',
  'examples',
  'phrases',
  'mnemonic',
  'derivatives',
  'synonyms',
  'antonyms',
  'note',
  'custom_fields',
] as const;

export function wordsToCsv(words: Array<Word | WordContent>): string {
  const rows = words.map((word) => ({
    word: word.word,
    phonetic: word.phonetic,
    definitions: encodeDefinitions(word.definitions),
    examples: encodeExamples(word.examples),
    phrases: encodeExamples(word.phrases),
    mnemonic: word.mnemonic,
    derivatives: encodeStringArray(word.derivatives),
    synonyms: encodeStringArray(word.synonyms),
    antonyms: encodeStringArray(word.antonyms),
    note: word.note,
    custom_fields: encodeCustomFields(word.customFields),
  }));
  return `\uFEFF${Papa.unparse(rows, { columns: [...CSV_COLUMNS], newline: '\r\n' })}`;
}

function toExportContent(word: Word | WordContent): WordContent {
  return {
    word: word.word,
    phonetic: word.phonetic,
    definitions: word.definitions,
    examples: word.examples,
    phrases: word.phrases,
    mnemonic: word.mnemonic,
    derivatives: word.derivatives,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    note: word.note,
    customFields: word.customFields,
  };
}

type LibraryMetadata = Pick<Library, 'name' | 'description'> & { tags?: string[] };

export function buildLibraryExportPackage(
  library: LibraryMetadata,
  words: Array<Word | WordContent>,
): LibraryExportPackage {
  return {
    app: 'qiuqiu-words',
    version: 1,
    exportedAt: new Date().toISOString(),
    library: {
      name: library.name,
      description: library.description,
      tags: sanitizeLibraryTags(library.tags),
    },
    words: words.map(toExportContent),
  };
}

export function wordsToJson(
  library: LibraryMetadata,
  words: Array<Word | WordContent>,
): string {
  return JSON.stringify(buildLibraryExportPackage(library, words), null, 2);
}

/* -------------------------------------------------------------------------- */
/*                              多词库合集                                      */
/* -------------------------------------------------------------------------- */

export interface LibraryBundleSource {
  library: LibraryMetadata;
  words: Array<Word | WordContent>;
}

export function buildLibraryBundle(sources: LibraryBundleSource[]): LibraryBundlePackage {
  return {
    app: 'qiuqiu-words',
    version: 2,
    kind: 'library-bundle',
    exportedAt: new Date().toISOString(),
    libraries: sources.map(({ library, words }) => ({
      name: library.name,
      description: library.description,
      tags: sanitizeLibraryTags(library.tags),
      words: words.map(toExportContent),
    })),
  };
}

export function libraryBundleToJson(sources: LibraryBundleSource[]): string {
  return JSON.stringify(buildLibraryBundle(sources), null, 2);
}

function cleanBundleText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function fileNameStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '导入词库';
}

/**
 * 支持：
 * - 丘丘背单词「导出全部」生成的 library-bundle；
 * - 单库导出的 JSON（library + words）；
 * - 由这些对象组成的数组。
 */
export function parseLibraryBundle(text: string, fileName: string): LibraryBundlePreview {
  const issues: string[] = [];
  let payload: unknown;

  try {
    payload = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return {
      fileName,
      libraries: [],
      issues: ['JSON 格式不正确，请检查逗号、引号与括号。'],
      totalWords: 0,
      skippedWords: 0,
    };
  }

  const payloadRecord = asRecord(payload);
  let rawLibraries: unknown[] = [];

  if (payloadRecord && Array.isArray(payloadRecord.libraries)) {
    rawLibraries = payloadRecord.libraries;
  } else if (payloadRecord && Array.isArray(payloadRecord.words)) {
    rawLibraries = [payloadRecord];
  } else if (Array.isArray(payload)) {
    rawLibraries = payload;
  } else {
    return {
      fileName,
      libraries: [],
      issues: ['没有找到词库数组。请选择由「丘丘背单词 → 导出全部」生成的 JSON 文件。'],
      totalWords: 0,
      skippedWords: 0,
    };
  }

  if (rawLibraries.length === 0) {
    return {
      fileName,
      libraries: [],
      issues: ['这个文件里没有可导入的词库。'],
      totalWords: 0,
      skippedWords: 0,
    };
  }

  const libraries: LibraryBundleItem[] = [];
  let totalWords = 0;
  let skippedWords = 0;
  const singleLibraryFallback = rawLibraries.length === 1 ? fileNameStem(fileName) : '';

  rawLibraries.forEach((rawLibrary, index) => {
    const record = asRecord(rawLibrary);
    if (!record) {
      issues.push(`第 ${index + 1} 个词库格式不正确，已跳过。`);
      return;
    }
    if (!Array.isArray(record.words)) {
      issues.push(`第 ${index + 1} 个词库缺少 words 数组，已跳过。`);
      return;
    }

    const metadata = asRecord(record.library) ?? record;
    const fallbackName =
      singleLibraryFallback || `导入词库 ${index + 1}`;
    const name =
      cleanBundleText(metadata.name, 40) ||
      cleanBundleText(metadata.title, 40) ||
      fallbackName;
    const description = cleanBundleText(metadata.description, 300);
    const tags = sanitizeLibraryTags(metadata.tags);
    const words: WordContent[] = [];
    let invalidWords = 0;

    record.words.forEach((rawWord) => {
      const wordRecord = asRecord(rawWord);
      if (!wordRecord) {
        invalidWords += 1;
        return;
      }
      const content = normalizeWordContent(mapJsonWord(wordRecord));
      if (!content.word) {
        invalidWords += 1;
        return;
      }
      // 合集导入保留重复单词；只跳过真正无效的词条。
      words.push(content);
    });

    skippedWords += invalidWords;
    if (invalidWords > 0) {
      issues.push(`词库「${name}」跳过了 ${invalidWords} 个无效单词。`);
    }
    if (words.length === 0) {
      issues.push(`词库「${name}」没有有效单词，已跳过。`);
      return;
    }

    libraries.push({ name, description, tags, words });
    totalWords += words.length;
  });

  if (libraries.length === 0) {
    issues.push('没有找到可导入的有效词库。');
  }

  return { fileName, libraries, issues, totalWords, skippedWords };
}

export const CSV_TEMPLATE = `\uFEFFword,phonetic,definitions,examples,phrases,mnemonic,derivatives,synonyms,antonyms,note,custom_fields
serendipity,/ˌserənˈdɪpəti/,n. 意外发现珍奇事物的本领 | n. 机缘巧合,I met her by serendipity. :: 我偶然遇见了她。||It was pure serendipity. :: 那纯粹是机缘巧合。,by serendipity :: 机缘巧合地,seren（平静）+ dipity，像平静海面突然漂来一份礼物,serendipitous,chance | luck,misfortune,在阅读中遇见的小词,词源 :: 源自童话《锡兰三王子》
cozy,/ˈkoʊzi/,adj. 温暖舒适的 | adj. 亲切的,This corner feels so cozy. :: 这个角落让人觉得好温暖。,cozy corner :: 温馨角落,想象一只猫蜷在毛毯里,coziness,snug | comfortable,cold,喜欢这个词的发音,场景 :: 冬日咖啡馆
`;
