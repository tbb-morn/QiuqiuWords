export const MAX_LIBRARY_TAGS = 12;
export const MAX_LIBRARY_TAG_LENGTH = 20;

function tagStrings(input: unknown): string[] {
  if (typeof input === 'string') {
    return input.split(/[,，|｜]/);
  }
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === 'string');
}

export function sanitizeLibraryTags(input: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of tagStrings(input)) {
    const tag = raw.replace(/^#+/, '').trim().slice(0, MAX_LIBRARY_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= MAX_LIBRARY_TAGS) break;
  }

  return result;
}

export function validateLibraryTags(input: unknown): string | null {
  const rawTags = tagStrings(input)
    .map((tag) => tag.replace(/^#+/, '').trim())
    .filter(Boolean);

  if (rawTags.length > MAX_LIBRARY_TAGS) {
    return `每个词库最多添加 ${MAX_LIBRARY_TAGS} 个标签`;
  }
  if (rawTags.some((tag) => tag.length > MAX_LIBRARY_TAG_LENGTH)) {
    return `每个标签最多 ${MAX_LIBRARY_TAG_LENGTH} 个字符`;
  }
  return null;
}
