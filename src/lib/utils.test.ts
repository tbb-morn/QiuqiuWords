import { describe, expect, it } from 'vitest';
import { sortLibrariesForDisplay } from './utils';

const library = (
  name: string,
  createdAt: number,
  updatedAt: number,
  wordCount = 3,
  masteredCount = 0,
) => ({ name, createdAt, updatedAt, wordCount, masteredCount });

describe('词库排序', () => {
  it('按首字母、修改时间或创建时间排序', () => {
    const items = [
      library('Charlie', 30, 10),
      library('Alpha', 10, 30),
      library('Bravo', 20, 20),
    ];

    expect(sortLibrariesForDisplay(items, 'name').map((item) => item.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(sortLibrariesForDisplay(items, 'updated').map((item) => item.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(sortLibrariesForDisplay(items, 'created').map((item) => item.name)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });

  it('已完全掌握的词库始终排在最后', () => {
    const items = [
      library('Alpha', 10, 10, 2, 2),
      library('Bravo', 20, 20, 2, 0),
      library('Charlie', 30, 30, 2, 1),
    ];

    const sorted = sortLibrariesForDisplay(items, 'name');
    expect(sorted[sorted.length - 1]?.name).toBe('Alpha');
    expect(sorted.slice(0, 2).map((item) => item.name)).toEqual(['Bravo', 'Charlie']);
  });
});
