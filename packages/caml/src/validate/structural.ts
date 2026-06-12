import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import type { ErrorObject } from 'ajv';

// ajv ships CJS with an explicit `exports.default`; under NodeNext ESM the class
// lives on `.default` of the imported namespace (same at runtime in Node and vitest).
const Ajv2020 = Ajv2020Import.default;
const addFormats = addFormatsImport.default;
import { camlSchema } from '../schema/caml-schema.js';
import type { CamlDocument } from '../generated/caml-types.js';
import type { CamlError, ValidationResult } from './errors.js';

// allowUnionTypes: Requirement.quantity legitimately accepts number|string|boolean|array.
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateSchema = ajv.compile(camlSchema);

/** Collections whose items carry an `id` we can anchor errors to. */
const SINGULAR: Record<string, string> = {
  components: 'component',
  connections: 'connection',
  groups: 'group',
  policies: 'policy',
  requirements: 'requirement',
  deployments: 'deployment',
  annotations: 'annotation',
};

const MAX_GROUP_DEPTH = 8;

/**
 * Structural validation — pass 1 of the 3-pass pipeline (blueprint doc 05).
 * Pass 1a: JSON Schema (shape, enums, patterns) via Ajv.
 * Pass 1b: integrity checks the schema cannot express — id uniqueness,
 *          reference resolution, group containment (acyclic, depth ≤ 8).
 * Catalog (pass 2) and semantic rules (pass 3) live elsewhere.
 */
export function validateStructure(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      valid: false,
      errors: [
        { code: 'invalid-document', path: 'document', message: 'document: must be a JSON object' },
      ],
    };
  }

  if (!validateSchema(input)) {
    const doc = input as Partial<CamlDocument>;
    const seen = new Set<string>();
    const errors = (validateSchema.errors ?? [])
      .map((e) => fromAjvError(doc, e))
      .filter((e) => {
        const key = `${e.path}|${e.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { valid: false, errors };
  }

  const errors = integrityErrors(input as CamlDocument);
  return { valid: errors.length === 0, errors };
}

function fromAjvError(doc: Partial<CamlDocument>, err: ErrorObject): CamlError {
  const segments = err.instancePath.split('/').filter(Boolean);
  let path = '';
  for (const seg of segments) {
    path += /^\d+$/.test(seg) ? `[${seg}]` : path ? `.${seg}` : seg;
  }
  if (!path) path = 'document';

  let element: string | undefined;
  let label = path;
  const [collection, index] = segments;
  if (collection && SINGULAR[collection] && index && /^\d+$/.test(index)) {
    const arr = (doc as Record<string, unknown>)[collection];
    const item = Array.isArray(arr) ? (arr[Number(index)] as unknown) : undefined;
    const id =
      item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
        ? item.id
        : undefined;
    label = id
      ? `${SINGULAR[collection]} "${id}" (${path})`
      : `${SINGULAR[collection]} ${path}`;
    element = id;
  }

  let detail = err.message ?? 'is invalid';
  if (err.keyword === 'additionalProperties') {
    const extra = (err.params as { additionalProperty?: string }).additionalProperty;
    detail = `${detail}: '${extra}'`;
  }
  return { code: 'schema', path, element, message: `${label}: ${detail}` };
}

function integrityErrors(doc: CamlDocument): CamlError[] {
  const errors: CamlError[] = [];
  const components = doc.components ?? [];
  const groups = doc.groups ?? [];
  const connections = doc.connections ?? [];
  const policies = doc.policies ?? [];
  const requirements = doc.requirements ?? [];
  const deployments = doc.deployments ?? [];

  // --- id uniqueness across every id-bearing element (ids are the diff anchor)
  const firstSeen = new Map<string, string>();
  const checkId = (id: string, where: string): void => {
    const prev = firstSeen.get(id);
    if (prev) {
      errors.push({
        code: 'duplicate-id',
        path: where,
        element: id,
        message: `id "${id}" is used by both ${prev} and ${where}`,
      });
    } else {
      firstSeen.set(id, where);
    }
  };
  components.forEach((c, i) => checkId(c.id, `components[${i}]`));
  groups.forEach((g, i) => checkId(g.id, `groups[${i}]`));
  connections.forEach((c, i) => checkId(c.id, `connections[${i}]`));
  policies.forEach((p, i) => checkId(p.id, `policies[${i}]`));
  requirements.forEach((r, i) => checkId(r.id, `requirements[${i}]`));
  deployments.forEach((d, i) => checkId(d.id, `deployments[${i}]`));

  const componentIds = new Set(components.map((c) => c.id));
  const groupIds = new Set(groups.map((g) => g.id));

  // --- reference resolution
  components.forEach((c, i) => {
    if (c.group !== undefined && !groupIds.has(c.group)) {
      errors.push({
        code: 'unresolved-ref',
        path: `components[${i}].group`,
        element: c.id,
        message: `component "${c.id}": group "${c.group}" does not exist`,
      });
    }
  });
  connections.forEach((c, i) => {
    for (const end of ['from', 'to'] as const) {
      const ref = c[end];
      if (!componentIds.has(ref) && !groupIds.has(ref)) {
        errors.push({
          code: 'unresolved-ref',
          path: `connections[${i}].${end}`,
          element: c.id,
          message: `connection "${c.id}": ${end} "${ref}" does not match any component or group`,
        });
      }
    }
  });
  groups.forEach((g, i) => {
    if (g.parent !== undefined && g.parent !== g.id && !groupIds.has(g.parent)) {
      errors.push({
        code: 'unresolved-ref',
        path: `groups[${i}].parent`,
        element: g.id,
        message: `group "${g.id}": parent "${g.parent}" does not exist`,
      });
    }
  });
  deployments.forEach((d, i) => {
    (d.overrides ?? []).forEach((o, j) => {
      if (!componentIds.has(o.target)) {
        errors.push({
          code: 'unresolved-ref',
          path: `deployments[${i}].overrides[${j}].target`,
          element: d.id,
          message: `deployment "${d.id}": override target "${o.target}" does not match any component`,
        });
      }
    });
  });
  policies.forEach((p, i) => {
    for (const id of p.appliesTo?.componentIds ?? []) {
      if (!componentIds.has(id)) {
        errors.push({
          code: 'unresolved-ref',
          path: `policies[${i}].appliesTo.componentIds`,
          element: p.id,
          message: `policy "${p.id}": component "${id}" does not exist`,
        });
      }
    }
    for (const id of p.appliesTo?.groupIds ?? []) {
      if (!groupIds.has(id)) {
        errors.push({
          code: 'unresolved-ref',
          path: `policies[${i}].appliesTo.groupIds`,
          element: p.id,
          message: `policy "${p.id}": group "${id}" does not exist`,
        });
      }
    }
  });

  // --- containment: acyclic + depth ≤ MAX_GROUP_DEPTH
  const parentOf = new Map(groups.map((g) => [g.id, g.parent]));
  const flaggedInCycle = new Set<string>();
  groups.forEach((g, i) => {
    const walked = new Set<string>([g.id]);
    let current = g.parent;
    let depth = 1;
    let inCycle = false;
    while (current !== undefined && parentOf.has(current)) {
      if (walked.has(current)) {
        inCycle = true;
        if (![...walked].some((id) => flaggedInCycle.has(id))) {
          errors.push({
            code: 'group-cycle',
            path: `groups[${i}]`,
            element: g.id,
            message: `group "${g.id}" is part of a containment cycle (${[...walked].join(' → ')} → ${current})`,
          });
        }
        for (const id of walked) flaggedInCycle.add(id);
        break;
      }
      walked.add(current);
      depth += 1;
      current = parentOf.get(current);
    }
    if (!inCycle && depth > MAX_GROUP_DEPTH) {
      errors.push({
        code: 'group-depth',
        path: `groups[${i}]`,
        element: g.id,
        message: `group "${g.id}" is nested ${depth} levels deep (max ${MAX_GROUP_DEPTH})`,
      });
    }
  });

  return errors;
}
