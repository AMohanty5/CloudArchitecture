import { canonicalizeValue } from '../canonical/canonicalize.js';
import { validateStructure } from '../validate/structural.js';
import type { CamlDocument } from '../generated/caml-types.js';
import type { CamlError } from '../validate/errors.js';

/**
 * RFC 6902 (JSON Patch) over RFC 6901 (JSON Pointer) — the mutation primitive.
 *
 * The canvas (CommandBus), AI proposals, and 3-way merge all express edits as
 * patches and round-trip them: every applied patch has an inverse, so undo and
 * conflict rollback are exact. Apply/invert here are content-agnostic JSON ops;
 * `applyModelPatch` adds the CAML-aware guarantee (validate post-apply).
 *
 * Equality (for `test` ops) is canonical — key order and id-bearing array order
 * are non-semantic, the same notion the differ and content hash use.
 */

export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'copy'; from: string; path: string }
  | { op: 'test'; path: string; value: unknown };

export type JsonPatch = JsonPatchOp[];

/** Raised for any malformed patch, unresolvable path, failed `test`, or post-apply CAML invalidity. */
export class PatchError extends Error {
  /** Present only when thrown by `applyModelPatch` for a structurally invalid result. */
  readonly errors?: CamlError[];
  constructor(message: string, errors?: CamlError[]) {
    super(message);
    this.name = 'PatchError';
    if (errors) this.errors = errors;
  }
}

// structuredClone is a runtime global in Node 17+ and all modern browsers; the
// cast supplies its type without pulling DOM/node lib typings into this pure pkg.
const clone = <T>(v: T): T => (globalThis as unknown as { structuredClone<U>(value: U): U }).structuredClone(v);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/* ------------------------------------------------------------------ *
 * JSON Pointer (RFC 6901)
 * ------------------------------------------------------------------ */

function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw new PatchError(`invalid JSON pointer (must be "" or start with "/"): ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function toPointer(parts: (string | number)[]): string {
  if (parts.length === 0) return '';
  return '/' + parts.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

function arrayIndex(token: string, path: string): number {
  if (!/^\d+$/.test(token)) throw new PatchError(`invalid array index "${token}" in ${path}`);
  return Number(token);
}

/** Walk to the container holding the final segment; throws if the path goes through a missing/non-container node. */
function navigateToParent(root: unknown, parts: string[], path: string): unknown {
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (Array.isArray(node)) {
      const idx = arrayIndex(key, path);
      if (idx >= node.length) throw new PatchError(`path not found (index out of range): ${path}`);
      node = node[idx];
    } else if (isObject(node)) {
      if (!(key in node)) throw new PatchError(`path not found: ${path}`);
      node = node[key];
    } else {
      throw new PatchError(`path traverses a non-container value: ${path}`);
    }
  }
  return node;
}

function getAt(root: unknown, path: string): unknown {
  const parts = parsePointer(path);
  let node = root;
  for (const key of parts) {
    if (Array.isArray(node)) {
      const idx = arrayIndex(key, path);
      if (idx >= node.length) throw new PatchError(`path not found (index out of range): ${path}`);
      node = node[idx];
    } else if (isObject(node)) {
      if (!(key in node)) throw new PatchError(`path not found: ${path}`);
      node = node[key];
    } else {
      throw new PatchError(`path not found: ${path}`);
    }
  }
  return node;
}

interface Holder {
  root: unknown;
}

function addAt(holder: Holder, path: string, value: unknown): void {
  const parts = parsePointer(path);
  if (parts.length === 0) {
    holder.root = clone(value);
    return;
  }
  const parent = navigateToParent(holder.root, parts, path);
  const key = parts[parts.length - 1]!;
  if (Array.isArray(parent)) {
    const idx = key === '-' ? parent.length : arrayIndex(key, path);
    if (idx > parent.length) throw new PatchError(`array index out of bounds: ${path}`);
    parent.splice(idx, 0, clone(value));
  } else if (isObject(parent)) {
    parent[key] = clone(value);
  } else {
    throw new PatchError(`cannot add to a non-container value: ${path}`);
  }
}

function removeAt(holder: Holder, path: string): unknown {
  const parts = parsePointer(path);
  if (parts.length === 0) throw new PatchError('cannot remove the document root');
  const parent = navigateToParent(holder.root, parts, path);
  const key = parts[parts.length - 1]!;
  if (Array.isArray(parent)) {
    const idx = arrayIndex(key, path);
    if (idx >= parent.length) throw new PatchError(`path not found (index out of range): ${path}`);
    return parent.splice(idx, 1)[0];
  }
  if (isObject(parent)) {
    if (!(key in parent)) throw new PatchError(`path not found: ${path}`);
    const old = parent[key];
    delete parent[key];
    return old;
  }
  throw new PatchError(`cannot remove from a non-container value: ${path}`);
}

function replaceAt(holder: Holder, path: string, value: unknown): unknown {
  const parts = parsePointer(path);
  if (parts.length === 0) {
    const old = holder.root;
    holder.root = clone(value);
    return old;
  }
  const parent = navigateToParent(holder.root, parts, path);
  const key = parts[parts.length - 1]!;
  if (Array.isArray(parent)) {
    const idx = arrayIndex(key, path);
    if (idx >= parent.length) throw new PatchError(`cannot replace (index out of range): ${path}`);
    const old = parent[idx];
    parent[idx] = clone(value);
    return old;
  }
  if (isObject(parent)) {
    if (!(key in parent)) throw new PatchError(`cannot replace a member that does not exist: ${path}`);
    const old = parent[key];
    parent[key] = clone(value);
    return old;
  }
  throw new PatchError(`cannot replace in a non-container value: ${path}`);
}

const isPrefix = (from: string, path: string): boolean => path === from || path.startsWith(from + '/');

function applyOperation(holder: Holder, op: JsonPatchOp): void {
  switch (op.op) {
    case 'add':
      addAt(holder, op.path, op.value);
      return;
    case 'remove':
      removeAt(holder, op.path);
      return;
    case 'replace':
      replaceAt(holder, op.path, op.value);
      return;
    case 'move': {
      if (isPrefix(op.from, op.path)) throw new PatchError(`cannot move a location into its own child: ${op.from} -> ${op.path}`);
      const v = removeAt(holder, op.from);
      addAt(holder, op.path, v);
      return;
    }
    case 'copy':
      addAt(holder, op.path, clone(getAt(holder.root, op.from)));
      return;
    case 'test': {
      const actual = getAt(holder.root, op.path);
      if (canonicalizeValue(actual) !== canonicalizeValue(op.value)) {
        throw new PatchError(`test failed: value at ${op.path} is not equal to the expected value`);
      }
      return;
    }
    default:
      throw new PatchError(`unknown op: ${JSON.stringify((op as { op?: unknown }).op)}`);
  }
}

/**
 * Apply an RFC-6902 patch to a deep clone of `doc` and return the result.
 * The input is never mutated. Throws {@link PatchError} on any malformed op,
 * unresolvable path, or failed `test`.
 */
export function applyPatch<T = unknown>(doc: unknown, patch: JsonPatch): T {
  const holder: Holder = { root: clone(doc) };
  for (const op of patch) applyOperation(holder, op);
  return holder.root as T;
}

/**
 * Apply a patch and assert the result is a structurally valid CAML model
 * (pass-1 validation). This is the mutation entry point for the write path:
 * a patch may never leave the model invalid. Throws {@link PatchError} with
 * `.errors` populated when the result fails validation.
 */
export function applyModelPatch(before: CamlDocument, patch: JsonPatch): CamlDocument {
  const next = applyPatch<CamlDocument>(before, patch);
  const result = validateStructure(next);
  if (!result.valid) {
    throw new PatchError(
      `patch produced an invalid CAML model: ${result.errors[0]?.message ?? 'unknown error'}`,
      result.errors,
    );
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Inversion: invertPatch(doc, p) is a patch q such that
 *   applyPatch(applyPatch(doc, p), q) ≡ doc   (canonically)
 * The inverse is computed against the pre-image, replaying the patch on a
 * working copy so each op's inverse is captured against the correct state.
 * ------------------------------------------------------------------ */

function inverseOf(holder: Holder, op: JsonPatchOp): JsonPatchOp[] | null {
  switch (op.op) {
    case 'add':
    case 'copy':
      return inverseOfInsert(holder, op.path);
    case 'remove': {
      const v = getAt(holder.root, op.path);
      return [{ op: 'add', path: op.path, value: clone(v) }];
    }
    case 'replace': {
      if (parsePointer(op.path).length === 0) return [{ op: 'replace', path: '', value: clone(holder.root) }];
      const v = getAt(holder.root, op.path);
      return [{ op: 'replace', path: op.path, value: clone(v) }];
    }
    case 'move': {
      guardNoOverwrite(holder, op.path);
      return [{ op: 'move', from: op.path, path: op.from }];
    }
    case 'test':
      return null;
  }
}

/** Inverse of an op that inserts a value at `path` (add/copy): restore-or-remove. */
function inverseOfInsert(holder: Holder, path: string): JsonPatchOp[] {
  const parts = parsePointer(path);
  if (parts.length === 0) return [{ op: 'replace', path: '', value: clone(holder.root) }];
  const parent = navigateToParent(holder.root, parts, path);
  const key = parts[parts.length - 1]!;
  if (Array.isArray(parent)) {
    const idx = key === '-' ? parent.length : arrayIndex(key, path);
    return [{ op: 'remove', path: toPointer([...parts.slice(0, -1), idx]) }];
  }
  if (isObject(parent) && key in parent) {
    return [{ op: 'replace', path, value: clone(parent[key]) }];
  }
  return [{ op: 'remove', path }];
}

function guardNoOverwrite(holder: Holder, path: string): void {
  const parts = parsePointer(path);
  if (parts.length === 0) return;
  const parent = navigateToParent(holder.root, parts, path);
  const key = parts[parts.length - 1]!;
  if (isObject(parent) && key !== '-' && key in parent) {
    throw new PatchError(`cannot invert a move/copy that overwrites an existing member: ${path}`);
  }
}

/**
 * Compute the inverse of `patch` relative to `doc` (the pre-image it applies to).
 * `move`/`copy` inversion requires the destination not to overwrite an existing
 * object member (the canvas never does); such cases throw {@link PatchError}.
 */
export function invertPatch(doc: unknown, patch: JsonPatch): JsonPatch {
  const holder: Holder = { root: clone(doc) };
  const inverse: JsonPatchOp[] = [];
  for (const op of patch) {
    const inv = inverseOf(holder, op);
    applyOperation(holder, op);
    if (inv) inverse.push(...inv);
  }
  return inverse.reverse();
}
