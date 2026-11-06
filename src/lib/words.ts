import type {
  CustomField,
  Definition,
  Example,
  WordContent,
  WordStatus,
} from '../types';
import { createId, normalizeWordKey } from './utils';

export function emptyWordContent(): WordContent {
  return {
    word: '',
    phonetic: '',
    definitions: [],
    examples: [],
    phrases: [],
    mnemonic: '',
    derivatives: [],
    synonyms: [],
    antonyms: [],
    note: '',
    customFields: [],
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanDefinitions(value: unknown): Definition[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { partOfSpeech: '', meaning: item.trim() };
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const partOfSpeech = text(
        record.partOfSpeech ?? record.pos ?? record.part ?? record['词性'],
      );
      const meaning = text(
        record.meaning ?? record.definition ?? record.zh ?? record['释义'],
      );
      if (!meaning) return null;
      return { partOfSpeech, meaning };
    })
    .filter((item): item is Definition => Boolean(item?.meaning));
}

function cleanExamples(value: unknown): Example[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { en: item.trim(), zh: '' };
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const en = text(record.en ?? record.english ?? record.text ?? record['英文']);
      const zh = text(record.zh ?? record.chinese ?? record.translation ?? record['中文']);
      if (!en && !zh) return null;
      return { en, zh };
    })
    .filter((item): item is Example => Boolean(item && (item.en || item.zh)));
}

function cleanStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeStrings(
      value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean),
    );
  }
  if (typeof value === 'string') {
    return dedupeStrings(value.split(/[|｜]/).map((item) => item.trim()).filter(Boolean));
  }
  return [];
}

function cleanCustomFields(value: unknown): CustomField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const label = text(record.label ?? record.name ?? record.key ?? record['名称']);
      const fieldValue = text(record.value ?? record.content ?? record['内容']);
      if (!label && !fieldValue) return null;
      return { label, value: fieldValue };
    })
    .filter((item): item is CustomField => Boolean(item));
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLocaleLowerCase('en-US');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 把外部输入（表单/CSV/JSON）收敛为干净的单词结构 */
export function normalizeWordContent(input: Partial<WordContent>): WordContent {
  return {
    word: text(input.word),
    phonetic: text(input.phonetic),
    definitions: cleanDefinitions(input.definitions),
    examples: cleanExamples(input.examples),
    phrases: cleanExamples(input.phrases),
    mnemonic: text(input.mnemonic),
    derivatives: cleanStringArray(input.derivatives),
    synonyms: cleanStringArray(input.synonyms),
    antonyms: cleanStringArray(input.antonyms),
    note: text(input.note),
    customFields: cleanCustomFields(input.customFields),
  };
}

export function validateWordContent(content: WordContent): string | undefined {
  if (!content.word) return '英文单词不能为空';
  if (content.word.length > 120) return '英文单词太长了（最多 120 个字符）';
  if (content.phonetic.length > 200) return '音标太长了';
  return undefined;
}

export function getPrimaryDefinition(content: Pick<WordContent, 'definitions'>): string {
  return content.definitions[0]?.meaning ?? '';
}

export function wordStatusLabel(status: WordStatus): string {
  switch (status) {
    case 'known':
      return '认识了';
    case 'unknown':
      return '还不熟';
    default:
      return '未学习';
  }
}

export function wordStatusTone(status: WordStatus): string {
  switch (status) {
    case 'known':
      return 'mint';
    case 'unknown':
      return 'peach';
    default:
      return 'neutral';
  }
}

export function newWordRecord(
  libraryId: string,
  content: WordContent,
): {
  id: string;
  libraryId: string;
  wordKey: string;
  createdAt: number;
  updatedAt: number;
} & WordContent {
  const now = Date.now();
  return {
    ...content,
    id: createId(),
    libraryId,
    wordKey: normalizeWordKey(content.word),
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyDefinition(): Definition {
  return { partOfSpeech: '', meaning: '' };
}

export function emptyExample(): Example {
  return { en: '', zh: '' };
}

export function emptyCustomField(): CustomField {
  return { label: '', value: '' };
}
