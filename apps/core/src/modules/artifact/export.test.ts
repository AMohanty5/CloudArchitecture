import { describe, expect, it } from 'vitest';
import { buildArtifacts } from './export';
import type { CamlDocument } from '@cac/caml';

const model: CamlDocument = {
  camlVersion: '1.0',
  id: 'arch_X',
  name: 'Bundle Test',
  groups: [{ id: 'vpc', kind: 'network', name: 'VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } }],
  components: [
    { id: 'db', type: 'database.relational', name: 'DB', group: 'vpc', binding: { provider: 'aws', service: 'aws.rds' } },
  ],
};

describe('buildArtifacts', () => {
  const { files } = buildArtifacts(model);

  it('fans the model out into a diagram, an HLD, and a Terraform bundle', () => {
    expect(files['diagram.svg']).toContain('<svg');
    expect(files['hld.md']).toContain('# Bundle Test — High-Level Design');
    expect(files['terraform/versions.tf']).toContain('hashicorp/aws');
    expect(files['terraform/vpc.tf']).toContain('resource "aws_db_instance" "db"');
  });

  it('honours the SVG theme option', () => {
    expect(buildArtifacts(model, { theme: 'dark' }).files['diagram.svg']).toContain('#0f172a');
  });

  it('is deterministic', () => {
    expect(buildArtifacts(model).files).toEqual(files);
  });
});
