export type CamlErrorCode =
  /** Document failed JSON Schema validation (pass 1). */
  | 'schema'
  /** Input is not a JSON object at all. */
  | 'invalid-document'
  /** The same id is used by more than one element. */
  | 'duplicate-id'
  /** A reference (connection endpoint, group parent, component group, override target…) points at a missing element. */
  | 'unresolved-ref'
  /** Group containment contains a cycle. */
  | 'group-cycle'
  /** Group nesting exceeds the maximum depth of 8. */
  | 'group-depth';

export interface CamlError {
  code: CamlErrorCode;
  /** Dotted path into the document, e.g. `components[3].binding.service`. */
  path: string;
  /** Id of the element the error is anchored to, when known. */
  element?: string;
  /** Human-readable, element-anchored message. */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: CamlError[];
}
