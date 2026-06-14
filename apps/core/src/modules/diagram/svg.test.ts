import { describe, expect, it } from 'vitest';
import { renderSvg } from './svg';
import type { CamlDocument } from '@cac/caml';

const model: CamlDocument = {
  camlVersion: '1.0',
  id: 'arch_X',
  name: 'Web 3-tier',
  groups: [
    { id: 'vpc', kind: 'network', name: 'Main VPC' },
    { id: 'sub', kind: 'subnet', name: 'App Subnet', parent: 'vpc' },
  ],
  components: [
    { id: 'lb', type: 'network.loadbalancer.l7', name: 'Web LB', binding: { provider: 'aws', service: 'aws.alb' } },
    { id: 'app', type: 'compute.vm.autoscaling_group', name: 'App', group: 'sub', binding: { provider: 'aws', service: 'aws.ec2_asg' } },
    { id: 'db', type: 'database.relational', name: 'Orders DB', group: 'sub', binding: { provider: 'aws', service: 'aws.rds' } },
  ],
  connections: [
    { id: 'c1', from: 'lb', to: 'app', kind: 'traffic' },
    { id: 'c2', from: 'app', to: 'db', kind: 'data' },
  ],
};

describe('renderSvg', () => {
  it('produces a well-formed SVG document sized to its content', () => {
    const svg = renderSvg(model);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    const dims = svg.match(/width="(\d+)" height="(\d+)"/);
    expect(Number(dims![1])).toBeGreaterThan(190);
    expect(Number(dims![2])).toBeGreaterThan(64);
  });

  it('renders every component and group with kind-styled edges', () => {
    const svg = renderSvg(model);
    for (const label of ['Web LB', 'App', 'Orders DB', 'Main VPC', 'App Subnet']) expect(svg).toContain(label);
    expect(svg).toContain('#2563eb'); // traffic edge colour
    expect(svg).toContain('stroke-dasharray="6 4"'); // dashed data edge
    expect((svg.match(/<line /g) ?? [])).toHaveLength(2); // one line per connection
  });

  it('escapes user text and honours the dark theme', () => {
    const danger: CamlDocument = { camlVersion: '1.0', id: 'a', name: 'x', components: [{ id: 'n', type: 't', name: '<script>&"' }] };
    const svg = renderSvg(danger, { theme: 'dark' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('#0f172a'); // dark background
  });
});
