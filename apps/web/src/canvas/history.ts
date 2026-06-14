/**
 * A minimal undo/redo stack (blueprint doc 06: local command history; the Stage-E
 * migration is Yjs). Pure + immutable. `record` coalesces consecutive transitions
 * that share a `groupKey` into a single entry — so a burst of same-field edits (or a
 * drag) is one undo step. Passing `undefined` as the key never coalesces.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey?: string;
}

const CAP = 100; // bound memory: keep at most CAP undo entries

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function record<T>(h: History<T>, next: T, groupKey?: string): History<T> {
  if (groupKey !== undefined && groupKey === h.lastKey) {
    // Same semantic group as the previous edit → replace present, keep the entry.
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present].slice(-CAP);
  return { past, present: next, future: [], lastKey: groupKey };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1]!;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: undefined };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0]!;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastKey: undefined };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}
