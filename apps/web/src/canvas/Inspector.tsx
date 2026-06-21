import { useEffect, useState } from 'react';
import { useCatalogService } from '../lib/queries';
import { PropertyForm } from './PropertyForm';
import type { CamlComponent } from './projector';
import type { CommitError } from '../lib/useEditor';

/** One relationship row shown in the inspector (the other endpoint + the connection id). */
export interface RelationshipItem {
  connId: string;
  name: string;
  service?: string;
  kind: string;
}
export interface RelationshipGroups {
  attachments: RelationshipItem[];
  security: RelationshipItem[];
  identity: RelationshipItem[];
  sidecar: RelationshipItem[];
  communications: RelationshipItem[];
}

interface InspectorProps {
  component: CamlComponent | undefined;
  errors: CommitError[];
  /** Groups available as containers for the MoveToGroup picker. */
  groups: Array<{ id: string; name: string; kind: string }>;
  /** The selected component's relationships, grouped by class (Day 54). */
  relationships?: RelationshipGroups;
  onRename: (name: string) => void;
  onSetProperty: (key: string, value: unknown) => void;
  onMoveToGroup: (group: string | undefined) => void;
  /** Detach a relationship by its connection id (un-folds an attachment / removes a line). */
  onDetach?: (connId: string) => void;
}

const META_LABEL: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8' };
const META_VALUE: React.CSSProperties = { fontSize: 13, color: '#334155', marginBottom: 8, wordBreak: 'break-word' };

function isFieldError(e: CommitError): boolean {
  return Boolean(e.path && e.path.includes('.properties.'));
}

/** A relationship section (Attachments / Security / Identity / Communicates with). */
function RelationshipSection({
  title,
  glyph,
  items,
  onDetach,
}: {
  title: string;
  glyph: string;
  items: RelationshipItem[];
  onDetach?: (connId: string) => void;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...META_LABEL, marginBottom: 4 }}>{title}</div>
      {items.map((it) => (
        <div key={it.connId} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
          {it.service ? (
            <img src={`/api/v1/catalog/icons/${it.service}`} width={16} height={16} alt="" style={{ borderRadius: 4, flexShrink: 0 }} />
          ) : (
            <span aria-hidden style={{ fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>{glyph}</span>
          )}
          <span style={{ fontSize: 12.5, color: '#334155', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
          <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0 }}>{it.kind}</span>
          {onDetach ? (
            <button
              onClick={() => onDetach(it.connId)}
              title="Detach"
              style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Selection inspector: identity + relationships + the schema-driven property form (doc 06). */
export function Inspector({ component, errors, groups, relationships, onRename, onSetProperty, onMoveToGroup, onDetach }: InspectorProps): React.JSX.Element {
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

      {relationships &&
      relationships.attachments.length + relationships.security.length + relationships.identity.length + relationships.sidecar.length + relationships.communications.length > 0 ? (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0 12px' }} />
          <RelationshipSection title="Attachments" glyph="▣" items={relationships.attachments} onDetach={onDetach} />
          <RelationshipSection title="Security" glyph="🛡" items={relationships.security} onDetach={onDetach} />
          <RelationshipSection title="Identity" glyph="🔐" items={relationships.identity} onDetach={onDetach} />
          <RelationshipSection title="Observability" glyph="📊" items={relationships.sidecar} onDetach={onDetach} />
          <RelationshipSection title="Communicates with" glyph="→" items={relationships.communications} onDetach={onDetach} />
        </>
      ) : null}

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
