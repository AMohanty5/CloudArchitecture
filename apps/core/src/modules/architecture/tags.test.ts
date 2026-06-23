import { describe, expect, it } from 'vitest';
import { MAX_TAGS, normalizeTags } from './tags';

describe('normalizeTags', () => {
  it('trims, lowercases, and drops blanks', () => {
    expect(normalizeTags(['  Web App ', 'PROD', '', '   '])).toEqual(['web app', 'prod']);
  });
  it('de-dupes case-insensitively, preserving first-seen order', () => {
    expect(normalizeTags(['prod', 'Prod', 'web', 'PROD'])).toEqual(['prod', 'web']);
  });
  it('caps the number of tags', () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });
  it('truncates over-long tags to the max length', () => {
    expect(normalizeTags(['x'.repeat(50)])[0]).toHaveLength(32);
  });
  it('ignores non-array / non-string input', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('prod')).toEqual([]);
    expect(normalizeTags([1, true, null, 'ok'])).toEqual(['ok']);
  });
});
