import { describe, expect, it } from 'vitest';
import { CAML_VERSION, isCamlVersionSupported } from './index.js';

describe('caml package smoke', () => {
  it('exposes the supported CAML version', () => {
    expect(CAML_VERSION).toBe('1.0');
  });

  it('accepts the supported version and rejects others', () => {
    expect(isCamlVersionSupported('1.0')).toBe(true);
    expect(isCamlVersionSupported('0.9')).toBe(false);
    expect(isCamlVersionSupported('2.0')).toBe(false);
  });
});
