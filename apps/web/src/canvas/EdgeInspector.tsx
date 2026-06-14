import type { CamlConnection } from './projector';

interface EdgeInspectorProps {
  connection: CamlConnection;
  /** Kinds permitted by the catalog for this edge's endpoints (smart-restricted picker). */
  kindOptions: string[];
  onSetKind: (kind: string) => void;
  onSetProperty: (key: string, value: unknown) => void;
  onDisconnect: () => void;
}

// CAML connection property enums (schema-accurate; doc 05 Connection.properties).
const PROTOCOLS = ['https', 'http', 'tcp', 'udp', 'grpc', 'websocket', 'postgres', 'mysql', 'redis', 'mongodb', 'amqp', 'kafka'];

const META_LABEL: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', margin: '10px 0 4px' };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 };

/** Edge inspector: kind picker + protocol/port/encrypted (blueprint doc 06). */
export function EdgeInspector({ connection, kindOptions, onSetKind, onSetProperty, onDisconnect }: EdgeInspectorProps): React.JSX.Element {
  const props = connection.properties ?? {};
  // Always include the current kind so a stored value outside the catalog set stays visible.
  const kinds = kindOptions.includes(connection.kind) ? kindOptions : [connection.kind, ...kindOptions];

  return (
    <aside style={panelStyle}>
      <div style={META_LABEL}>Connection</div>
      <div style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
        {connection.from} <span style={{ color: '#94a3b8' }}>→</span> {connection.to}
      </div>

      <div style={{ ...META_LABEL }}>Kind</div>
      <select style={inputStyle} value={connection.kind} onChange={(e) => onSetKind(e.target.value)}>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '14px 0' }} />
      <div style={{ ...META_LABEL, marginTop: 0 }}>Properties</div>

      <label style={fieldLabel}>protocol</label>
      <select
        style={{ ...inputStyle, marginBottom: 12 }}
        value={props.protocol ?? ''}
        onChange={(e) => onSetProperty('protocol', e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">—</option>
        {PROTOCOLS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <label style={fieldLabel}>port</label>
      <input
        type="number"
        style={{ ...inputStyle, marginBottom: 12 }}
        value={props.port ?? ''}
        placeholder="1–65535"
        onChange={(e) => onSetProperty('port', e.target.value === '' ? undefined : Number(e.target.value))}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16 }}>
        <input type="checkbox" checked={props.encrypted === true} onChange={(e) => onSetProperty('encrypted', e.target.checked)} />
        encrypted
      </label>

      <button
        onClick={onDisconnect}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13, cursor: 'pointer' }}
      >
        Delete connection
      </button>
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
