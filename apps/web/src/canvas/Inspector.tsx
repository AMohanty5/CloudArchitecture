import { useEffect, useState } from 'react';
import { useCatalogService } from '../lib/queries';
import { PropertyForm } from './PropertyForm';
import type { CamlComponent } from './projector';
import type { CommitError } from '../lib/useEditor';

interface InspectorProps {
  component: CamlComponent | undefined;
  errors: CommitError[];
  /** Groups available as containers for the MoveToGroup picker. */
  groups: Array<{ id: string; name: string; kind: string }>;
  onRename: (name: string) => void;
  onSetProperty: (key: string, value: unknown) => void;
  onMoveToGroup: (group: string | undefined) => void;
}

const META_LABEL: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8' };
const META_VALUE: React.CSSProperties = { fontSize: 13, color: '#334155', marginBottom: 8, wordBreak: 'break-word' };

function isFieldError(e: CommitError): boolean {
  return Boolean(e.path && e.path.includes('.properties.'));
}

/** Selection inspector: identity + the schema-driven property form (blueprint doc 06). */
export function Inspector({ component, errors, groups, onRename, onSetProperty, onMoveToGroup }: InspectorProps): React.JSX.Element {
  const service = useCatalogService(component?.binding?.service);
  const [name, setName] = useState(component?.name ?? '');

  // Re-sync the name field when the selection changes or a rejected rename rolls back.
  useEffect(() => setName(component?.name ?? ''), [component?.id, component?.name]);

  if (!component) {
    return (
      <aside style={panelStyle}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Select a node to edit its properties.</p>
      </aside>
    );
  }

  const mine = errors.filter((e) => e.element === component.id);
  const panelErrors = mine.filter((e) => !isFieldError(e));
  const errorsFor = (key: string): string[] =>
    mine.filter((e) => e.path?.endsWith(`.properties.${key}`)).map((e) => e.message);

  const commitName = (): void => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== component.name) onRename(trimmed);
  };

  return (
    <aside style={panelStyle}>
      <div style={META_LABEL}>Name</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600, marginBottom: 12 }}
      />

      <div style={META_LABEL}>Abstract type</div>
      <div style={META_VALUE}>{component.type}</div>
      <div style={META_LABEL}>Binding</div>
      <div style={META_VALUE}>{component.binding ? `${component.binding.provider} · ${component.binding.service}` : '—'}</div>
      <div style={META_LABEL}>Group</div>
      <select
        value={component.group ?? ''}
        onChange={(e) => onMoveToGroup(e.target.value === '' ? undefined : e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, marginBottom: 8 }}
      >
        <option value="">(top level)</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} · {g.kind}
          </option>
        ))}
      </select>

      {panelErrors.map((e) => (
        <div key={e.message} style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
          {e.message}
        </div>
      ))}

      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0 14px' }} />
      <div style={{ ...META_LABEL, marginBottom: 10 }}>Properties</div>

      {service.isLoading ? <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading schema…</p> : null}
      {service.data ? (
        <PropertyForm
          schema={service.data.properties ?? {}}
          values={component.properties ?? {}}
          errorsFor={errorsFor}
          onChange={onSetProperty}
        />
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
