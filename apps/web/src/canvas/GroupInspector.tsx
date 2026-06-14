import { useEffect, useState } from 'react';
import { useGroupService } from '../lib/queries';
import { PropertyForm } from './PropertyForm';
import type { CamlGroup } from './projector';
import type { CommitError } from '../lib/useEditor';

interface GroupInspectorProps {
  group: CamlGroup;
  /** Other groups available as containment parents (excludes the group itself + its descendants). */
  parentOptions: Array<{ id: string; name: string; kind: string }>;
  violation?: string;
  errors: CommitError[];
  onRename: (name: string) => void;
  onReparent: (parent: string | undefined) => void;
  onSetProperty: (key: string, value: unknown) => void;
}

const META_LABEL: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', margin: '10px 0 4px' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 };

/** Group inspector: identity, containment parent + status, and the schema-driven property form. */
export function GroupInspector({ group, parentOptions, violation, errors, onRename, onReparent, onSetProperty }: GroupInspectorProps): React.JSX.Element {
  const service = useGroupService(group.provider, group.kind);
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.id, group.name]);

  const mine = errors.filter((e) => e.element === group.id);
  const errorsFor = (key: string): string[] => mine.filter((e) => e.path?.endsWith(`.properties.${key}`)).map((e) => e.message);

  const commitName = (): void => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== group.name) onRename(trimmed);
  };

  return (
    <aside style={panelStyle}>
      <div style={META_LABEL}>Group name</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        style={{ ...inputStyle, fontSize: 14, fontWeight: 600, marginBottom: 12 }}
      />

      <div style={META_LABEL}>Kind</div>
      <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>{group.kind}</div>

      <div style={META_LABEL}>Inside</div>
      <select style={inputStyle} value={group.parent ?? ''} onChange={(e) => onReparent(e.target.value === '' ? undefined : e.target.value)}>
        <option value="">(top level)</option>
        {parentOptions.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} · {g.kind}
          </option>
        ))}
      </select>

      {violation ? (
        <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 8px' }}>
          ⚠️ {violation}
        </div>
      ) : null}

      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '14px 0' }} />
      <div style={{ ...META_LABEL, marginTop: 0, marginBottom: 10 }}>Properties</div>

      {service.isLoading ? <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading schema…</p> : null}
      {service.data ? (
        <PropertyForm schema={service.data.properties ?? {}} values={group.properties ?? {}} errorsFor={errorsFor} onChange={onSetProperty} />
      ) : null}
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  borderLeft: '1px solid #e2e8f0',
  padding: 14,
  overflowY: 'auto',
  fontFamily: 'system-ui, sans-serif',
};
