import { describe, expect, it } from 'vitest';
import { CAML_VERSION, camlSchema, indexModel, validateStructure } from './index.js';

describe('package surface', () => {
  it('exports the supported CAML version', () => {
    expect(CAML_VERSION).toBe('1.0');
  });

  it('exports the schema, validator, and indexer', () => {
    expect(String(camlSchema['$id'])).toContain('caml/1.0');
    expect(typeof validateStructure).toBe('function');
    expect(typeof indexModel).toBe('function');
  });
});
