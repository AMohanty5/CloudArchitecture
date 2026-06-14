import { useState } from 'react';
import type { PropertySchema } from '../lib/queries';

/**
 * Parse a text-input value into the typed value the schema expects. Empty → undefined
 * (clears the property back to its catalog default). Pure — unit-tested. Object/JSON
 * fields are handled separately (they carry their own local edit state).
 */
export function parseFieldInput(prop: PropertySchema, raw: string): unknown {
  if (raw === '') return undefined;
  if (prop.type === 'integer' || prop.type === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n; // NaN passes through so pass-2 reports it
  }
  return raw;
}

interface FieldProps {
  name: string;
  prop: PropertySchema;
  value: unknown;
  errors: string[];
  onChange: (value: unknown) => void;
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '5px 7px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 13,
};

function Field({ name, prop, value, errors, onChange }: FieldProps): React.JSX.Element {
  const invalid = errors.length > 0;
  const border = invalid ? '1px solid #dc2626' : inputStyle.border;
  const [objText, setObjText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const [objError, setObjError] = useState<string | null>(null);

  let control: React.JSX.Element;
  if (prop.type === 'boolean') {
    control = (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {value === true ? 'true' : 'false'}
      </label>
    );
  } else if (prop.enum) {
    control = (
      <select style={{ ...inputStyle, border }} value={value === undefined ? '' : String(value)} onChange={(e) => onChange(parseFieldInput(prop, e.target.value))}>
        <option value="">{prop.default !== undefined ? `default — ${String(prop.default)}` : '—'}</option>
        {prop.enum.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
    );
  } else if (prop.type === 'object') {
    control = (
      <textarea
        style={{ ...inputStyle, border: objError ? '1px solid #dc2626' : border, fontFamily: 'monospace', minHeight: 64 }}
        value={objText}
        placeholder="{ }"
        onChange={(e) => {
          setObjText(e.target.value);
          if (e.target.value.trim() === '') {
            setObjError(null);
            onChange(undefined);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(e.target.value);
            setObjError(null);
            onChange(parsed);
          } catch {
            setObjError('invalid JSON');
          }
        }}
      />
    );
  } else {
    const type = prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text';
    control = (
      <input
        type={type}
        style={{ ...inputStyle, border }}
        value={value === undefined ? '' : String(value)}
        placeholder={prop.default !== undefined ? String(prop.default) : ''}
        onChange={(e) => onChange(parseFieldInput(prop, e.target.value))}
      />
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{name}</label>
      {control}
      {prop.description ? <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{prop.description}</div> : null}
      {objError ? <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{objError}</div> : null}
      {errors.map((e) => (
        <div key={e} style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>
          {e}
        </div>
      ))}
    </div>
  );
}

interface PropertyFormProps {
  schema: Record<string, PropertySchema>;
  values: Record<string, unknown>;
  errorsFor: (key: string) => string[];
  onChange: (key: string, value: unknown) => void;
}

/** Renders one input per catalog property — zero per-service UI code (blueprint doc 06). */
export function PropertyForm({ schema, values, errorsFor, onChange }: PropertyFormProps): React.JSX.Element {
  const keys = Object.keys(schema);
  if (keys.length === 0) return <p style={{ fontSize: 13, color: '#94a3b8' }}>This service has no editable properties.</p>;
  return (
    <div>
      {keys.map((key) => (
        <Field key={key} name={key} prop={schema[key]!} value={values[key]} errors={errorsFor(key)} onChange={(v) => onChange(key, v)} />
      ))}
    </div>
  );
}
