import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { CamlDocument } from '../generated/caml-types.js';
import { canonicalize } from './canonicalize.js';

/** 64-char lowercase hex SHA-256 of the canonical form. */
export type CommitHash = string;

/**
 * Content hash of a model. Two documents hash identically iff they are
 * semantically identical under the canonicalization rules — key order, array
 * order of id-bearing collections, and annotations never matter.
 *
 * Pure JS (@noble/hashes), so this works in Node services and the browser
 * canvas alike.
 */
export function hashModel(doc: CamlDocument): CommitHash {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(doc))));
}
