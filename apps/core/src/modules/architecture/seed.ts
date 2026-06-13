import { Buffer } from 'node:buffer';
import type { Pool } from 'pg';
import { hashModel, validateStructure } from '@cac/caml';
import type { CamlDocument } from '@cac/caml';
import { validateAgainstCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import { DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID } from '../../config/config';
import { computeStats } from './stats';

export interface SeededCommit {
  hash: string;
  message: string;
  model: CamlDocument;
}
export interface SeededArchitecture {
  id: string;
  name: string;
  commits: SeededCommit[];
}

interface SeedSpec {
  id: string;
  name: string;
  /** Ordered commit messages + models (commit N's parent is commit N-1). */
  history: { message: string; model: CamlDocument }[];
}

/* ---- model builders (only the 5 seed-catalog services, so pass-2 is clean) ---- */

const empty = (id: string, name: string): CamlDocument => ({ camlVersion: '1.0', id, name, components: [] });

const region = { id: 'region', kind: 'region', name: 'us-east-1', provider: 'aws' } as const;
const vpc = { id: 'vpc', kind: 'network', name: 'Main VPC', parent: 'region', properties: { cidr: '10.0.0.0/16' } } as const;
const subnetPub = { id: 'subnet-pub', kind: 'subnet', name: 'Public', parent: 'vpc', properties: { cidr: '10.0.1.0/24', zone: 'us-east-1a', public: true } } as const;
const subnetApp = { id: 'subnet-app', kind: 'subnet', name: 'App', parent: 'vpc', properties: { cidr: '10.0.2.0/24', zone: 'us-east-1a', public: false } } as const;
const subnetDb = { id: 'subnet-db', kind: 'subnet', name: 'Data', parent: 'vpc', properties: { cidr: '10.0.3.0/24', zone: 'us-east-1a', public: false } } as const;

const alb = { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'Web LB', binding: { provider: 'aws', service: 'aws.alb' }, group: 'subnet-pub', properties: { scheme: 'internet-facing' } } as const;
const asg = (desired: number) => ({ id: 'app-asg', type: 'compute.vm.autoscaling_group', name: 'App tier', binding: { provider: 'aws', service: 'aws.ec2_asg' }, group: 'subnet-app', properties: { instanceType: 'm5.large', minSize: 2, maxSize: 10, desiredCapacity: desired } }) as const;
const rds = (multiAz: boolean, storage: number) => ({ id: 'orders-db', type: 'database.relational', name: 'Orders DB', binding: { provider: 'aws', service: 'aws.rds' }, group: 'subnet-db', properties: { engine: 'postgres', engineVersion: '16', instanceClass: 'db.t3.medium', multiAz, allocatedStorageGb: storage } }) as const;

const SEEDS: SeedSpec[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Acme Web Platform',
    history: [
      { message: 'Initial commit', model: empty('arch_ACMEWEB001', 'Acme Web Platform') },
      { message: 'Lay down the network', model: { ...empty('arch_ACMEWEB001', 'Acme Web Platform'), groups: [region, vpc, subnetPub, subnetApp, subnetDb] } },
      { message: 'Add load balancer + app tier', model: { ...empty('arch_ACMEWEB001', 'Acme Web Platform'), groups: [region, vpc, subnetPub, subnetApp, subnetDb], components: [alb, asg(2)], connections: [{ id: 'lb-app', from: 'web-lb', to: 'app-asg', kind: 'traffic', properties: { protocol: 'https', port: 443 } }] } },
      { message: 'Add database tier', model: { ...empty('arch_ACMEWEB001', 'Acme Web Platform'), groups: [region, vpc, subnetPub, subnetApp, subnetDb], components: [alb, asg(2), rds(true, 100)], connections: [{ id: 'lb-app', from: 'web-lb', to: 'app-asg', kind: 'traffic', properties: { protocol: 'https', port: 443 } }, { id: 'app-db', from: 'app-asg', to: 'orders-db', kind: 'data', properties: { protocol: 'postgres', port: 5432 } }] } },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Batch Compute',
    history: [
      { message: 'Initial commit', model: empty('arch_BATCH00001', 'Batch Compute') },
      { message: 'VPC + compute', model: { ...empty('arch_BATCH00001', 'Batch Compute'), groups: [region, vpc, subnetApp], components: [asg(2)] } },
      { message: 'Scale the fleet up', model: { ...empty('arch_BATCH00001', 'Batch Compute'), groups: [region, vpc, subnetApp], components: [asg(8)] } },
    ],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Orders Datastore',
    history: [
      { message: 'Initial commit', model: empty('arch_ORDERS0001', 'Orders Datastore') },
      { message: 'VPC + database', model: { ...empty('arch_ORDERS0001', 'Orders Datastore'), groups: [region, vpc, subnetDb], components: [rds(false, 50)] } },
      { message: 'Make it HA and grow storage', model: { ...empty('arch_ORDERS0001', 'Orders Datastore'), groups: [region, vpc, subnetDb], components: [rds(true, 200)] } },
    ],
  },
];

/**
 * Load 3 fixture architectures with multi-commit histories (demo + test data).
 * Rerunnable: each seed's rows are deleted first, and models are deterministic
 * so hashes are stable across runs. Validates every model (pass-1 + pass-2).
 */
export async function seedDatabase(pool: Pool, catalog: Catalog): Promise<SeededArchitecture[]> {
  const result: SeededArchitecture[] = [];

  for (const spec of SEEDS) {
    await pool.query('DELETE FROM branches WHERE architecture_id = $1', [spec.id]);
    await pool.query('DELETE FROM model_commits WHERE architecture_id = $1', [spec.id]);
    await pool.query('DELETE FROM architectures WHERE id = $1', [spec.id]);

    await pool.query(
      `INSERT INTO architectures (id, workspace_id, name, default_branch, catalog_version, created_by)
       VALUES ($1, $2, $3, 'main', 'dev', $4)`,
      [spec.id, DEFAULT_WORKSPACE_ID, spec.name, DEFAULT_USER_ID],
    );

    const base = Date.now();
    let parents: string[] = [];
    let head = '';
    const commits: SeededCommit[] = [];

    spec.history.forEach((entry, i) => {
      const structural = validateStructure(entry.model);
      if (!structural.valid) {
        throw new Error(`seed "${spec.name}" commit ${i} failed pass-1: ${structural.errors[0]?.message}`);
      }
    });

    for (let i = 0; i < spec.history.length; i++) {
      const { message, model } = spec.history[i]!;
      const catalogErrors = validateAgainstCatalog(model, catalog).errors;
      if (catalogErrors.length > 0) {
        throw new Error(`seed "${spec.name}" commit ${i} failed pass-2: ${catalogErrors[0]?.message}`);
      }
      const hash = hashModel(model);
      await pool.query(
        `INSERT INTO model_commits
           (hash, architecture_id, parent_hashes, origin, message, model, model_size_bytes, stats, created_at)
         VALUES ($1, $2, $3, 'manual', $4, $5, $6, $7, $8)
         ON CONFLICT (architecture_id, hash) DO NOTHING`,
        [hash, spec.id, parents, message, model, Buffer.byteLength(JSON.stringify(model)), computeStats(model), new Date(base + i * 1000)],
      );
      commits.push({ hash, message, model });
      parents = [hash];
      head = hash;
    }

    await pool.query(`INSERT INTO branches (architecture_id, name, head_hash) VALUES ($1, 'main', $2)`, [spec.id, head]);
    result.push({ id: spec.id, name: spec.name, commits });
  }

  return result;
}
