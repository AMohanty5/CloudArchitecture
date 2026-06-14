import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, initHistory, record, redo, undo } from './history';

describe('history', () => {
  it('records distinct entries and undoes/redoes them', () => {
    let h = initHistory(0);
    h = record(h, 1, 'a');
    h = record(h, 2, 'b');
    expect(h.present).toBe(2);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe(1);
    expect(canRedo(h)).toBe(true);
  });

  it('coalesces consecutive transitions that share a group key', () => {
    let h = initHistory('');
    h = record(h, 'a', 'name');
    h = record(h, 'ab', 'name');
    h = record(h, 'abc', 'name');
    expect(h.present).toBe('abc');
    h = undo(h); // one undo reverses the whole coalesced burst
    expect(h.present).toBe('');
    expect(canUndo(h)).toBe(false);
  });

  it('never coalesces when the key is undefined', () => {
    let h = initHistory(0);
    h = record(h, 1);
    h = record(h, 2);
    h = undo(h);
    expect(h.present).toBe(1);
  });

  it('a new record after undo clears the redo branch', () => {
    let h = initHistory(0);
    h = record(h, 1, 'a');
    h = record(h, 2, 'b');
    h = undo(h); // present = 1, future = [2]
    h = record(h, 9, 'c');
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
  });

  it('starts a fresh entry after an undo even with the same key', () => {
    let h = initHistory(0);
    h = record(h, 1, 'name');
    h = undo(h); // lastKey reset
    h = record(h, 5, 'name');
    h = undo(h);
    expect(h.present).toBe(0); // the second edit was its own entry
  });
});
