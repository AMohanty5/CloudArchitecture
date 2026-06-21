import { describe, expect, it } from 'vitest';
import { CANVAS_THEME, CONTAINER, SPACE, TYPE_SCALE } from './theme';

describe('design tokens (Day 56 foundation)', () => {
  it('type scale is ascending — services louder than metadata, region context largest', () => {
    expect(TYPE_SCALE.meta).toBeLessThan(TYPE_SCALE.label);
    expect(TYPE_SCALE.label).toBeLessThan(TYPE_SCALE.name);
    expect(TYPE_SCALE.name).toBeLessThan(TYPE_SCALE.region);
  });

  it('spacing values are all on the 4px grid', () => {
    for (const v of Object.values(SPACE)) expect(v % 4).toBe(0);
  });

  it('container washes stay faint (≤ 6%) so boundaries are context, not cages', () => {
    for (const v of Object.values(CONTAINER.wash)) expect(v).toBeLessThanOrEqual(0.06);
  });

  it('light and dark themes expose the exact same token shape (parity)', () => {
    const keys = (o: object): string[] => Object.keys(o).sort();
    expect(keys(CANVAS_THEME.dark)).toEqual(keys(CANVAS_THEME.light));
    expect(keys(CANVAS_THEME.dark.connector)).toEqual(keys(CANVAS_THEME.light.connector));
  });

  it('the two themes actually differ on their backdrop (not a no-op toggle)', () => {
    expect(CANVAS_THEME.dark.paneBg).not.toBe(CANVAS_THEME.light.paneBg);
    expect(CANVAS_THEME.dark.nodeSurface).not.toBe(CANVAS_THEME.light.nodeSurface);
  });
});
