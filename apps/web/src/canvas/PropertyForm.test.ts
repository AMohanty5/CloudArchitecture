import { describe, expect, it } from 'vitest';
import { parseFieldInput } from './PropertyForm';

describe('parseFieldInput', () => {
  it('empty input clears the property (undefined)', () => {
    expect(parseFieldInput({ type: 'string' }, '')).toBeUndefined();
    expect(parseFieldInput({ type: 'integer' }, '')).toBeUndefined();
  });

  it('numbers coerce to numeric values', () => {
    expect(parseFieldInput({ type: 'integer' }, '20')).toBe(20);
    expect(parseFieldInput({ type: 'number' }, '1.5')).toBe(1.5);
  });

  it('non-numeric numeric input passes through as a string for pass-2 to reject', () => {
    expect(parseFieldInput({ type: 'integer' }, 'abc')).toBe('abc');
  });

  it('strings (incl. enum picks) pass through unchanged', () => {
    expect(parseFieldInput({ type: 'string', enum: ['postgres', 'mysql'] }, 'mysql')).toBe('mysql');
  });
});
