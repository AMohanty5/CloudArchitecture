import type { CamlDocument, Component, Group } from '@cac/caml';
import { emitAll, ref } from './hcl';
import type { HclBlock } from './hcl';

/**
 * CAML → Terraform generator (blueprint doc 03 §3.9). Builds a typed resource
 * graph for the working catalog (the Day-6 five: vpc, subnet, alb, ec2_asg, rds),
 * wires references (subnet→vpc, asg→subnets, …), and lays the HCL out per
 * top-level group with a versions/variables/backend/README skeleton. Output is a
 * file map; deterministic + pure. Target: `terraform validate` clean.
 */

export interface TerraformBundle {
  files: Record<string, string>;
}

/** Terraform identifiers: CAML ids are `[a-z][a-z0-9-]*`; map hyphens to underscores. */
function tf(id: string): string {
  return id.replace(/-/g, '_');
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

interface Built {
  /** The resource blocks, keyed by the owning top-level group id (or '' for root). */
  blocksByRoot: Map<string, HclBlock[]>;
}

export function generateTerraform(model: CamlDocument): TerraformBundle {
  const groups = model.groups ?? [];
  const components = model.components ?? [];
  const groupById = new Map<string, Group>(groups.map((g) => [g.id, g]));

  // Nearest ancestor group of the given kind (e.g. a subnet's enclosing network).
  const ancestorOfKind = (start: string | undefined, kind: string): Group | undefined => {
    let cur = start ? groupById.get(start) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      if (cur.kind === kind) return cur;
      seen.add(cur.id);
      cur = cur.parent ? groupById.get(cur.parent) : undefined;
    }
    return undefined;
  };

  // The top-level group an element rolls up to (for per-group file layout).
  const rootGroupId = (groupOrParent: string | undefined): string => {
    let cur = groupOrParent ? groupById.get(groupOrParent) : undefined;
    const seen = new Set<string>();
    while (cur?.parent && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = groupById.get(cur.parent);
    }
    return cur?.id ?? '';
  };

  // All subnet resource refs (used by ALB subnets / ASG zone identifier).
  const subnetRefs = groups
    .filter((g) => g.kind === 'subnet')
    .map((g) => ref(`aws_subnet.${tf(g.id)}.id`));

  const built: Built = { blocksByRoot: new Map() };
  const push = (rootId: string, ...blocks: HclBlock[]): void => {
    const list = built.blocksByRoot.get(rootId) ?? [];
    list.push(...blocks);
    built.blocksByRoot.set(rootId, list);
  };

  // --- Groups → network/subnet resources ---
  for (const g of groups) {
    const root = rootGroupId(g.id);
    if (g.kind === 'network') {
      push(root, {
        type: 'resource',
        labels: ['aws_vpc', tf(g.id)],
        attrs: {
          cidr_block: str(g.properties?.cidr, '10.0.0.0/16'),
          tags: ref(`{ Name = ${JSON.stringify(g.name)} }`),
        },
      });
    } else if (g.kind === 'subnet') {
      const vpc = ancestorOfKind(g.parent, 'network');
      push(root, {
        type: 'resource',
        labels: ['aws_subnet', tf(g.id)],
        attrs: {
          vpc_id: vpc ? ref(`aws_vpc.${tf(vpc.id)}.id`) : ref('null'),
          cidr_block: str(g.properties?.cidr, '10.0.0.0/24'),
          availability_zone: g.properties?.zone ? str(g.properties.zone, '') : undefined,
          tags: ref(`{ Name = ${JSON.stringify(g.name)} }`),
        },
      });
    }
  }

  // --- Components → service resources ---
  for (const c of components) {
    const root = rootGroupId(c.group);
    const blocks = serviceBlocks(c, subnetRefs);
    if (blocks.length > 0) push(root, ...blocks);
  }

  return { files: assembleFiles(model, built, groupById) };
}

/** Dispatch a bound component to its resource blocks; unbound/unknown services emit nothing. */
function serviceBlocks(c: Component, subnetRefs: ReturnType<typeof ref>[]): HclBlock[] {
  switch (c.binding?.service) {
    case 'aws.alb':
      return albBlocks(c, subnetRefs);
    case 'aws.ec2_asg':
      return asgBlocks(c, subnetRefs);
    case 'aws.rds':
      return [dbBlocks(c)];
    case 'aws.s3':
      return [s3Blocks(c)];
    case 'aws.sqs':
      return [sqsBlocks(c)];
    case 'aws.sns':
      return [snsBlocks(c)];
    case 'aws.dynamodb':
      return [dynamoBlocks(c)];
    case 'aws.elasticache_redis':
      return [cacheBlocks(c)];
    case 'aws.kms':
      return [kmsBlocks(c)];
    case 'aws.secrets_manager':
      return [secretBlocks(c)];
    case 'aws.lambda':
      return lambdaBlocks(c);
    default:
      return [];
  }
}

/** `{ Name = "<component name>" }` tag literal, shared by the resource builders. */
function nameTag(c: Component): ReturnType<typeof ref> {
  return ref(`{ Name = ${JSON.stringify(c.name)} }`);
}

function albBlocks(c: Component, subnetRefs: ReturnType<typeof ref>[]): HclBlock[] {
  return [
    {
      type: 'resource',
      labels: ['aws_lb', tf(c.id)],
      attrs: {
        name: c.id.slice(0, 32),
        internal: false,
        load_balancer_type: 'application',
        subnets: subnetRefs.length > 0 ? subnetRefs : undefined,
        tags: ref(`{ Name = ${JSON.stringify(c.name)} }`),
      },
    },
  ];
}

function asgBlocks(c: Component, subnetRefs: ReturnType<typeof ref>[]): HclBlock[] {
  const scaling = (c.properties?.scaling ?? {}) as { min?: number; max?: number };
  const ltName = `${tf(c.id)}_lt`;
  return [
    {
      type: 'resource',
      labels: ['aws_launch_template', ltName],
      attrs: { name_prefix: `${c.id.slice(0, 24)}-`, instance_type: 't3.micro' },
    },
    {
      type: 'resource',
      labels: ['aws_autoscaling_group', tf(c.id)],
      attrs: {
        name: c.id.slice(0, 32),
        min_size: num(scaling.min, 1),
        max_size: num(scaling.max, 3),
        // Exactly one of vpc_zone_identifier / availability_zones is required.
        vpc_zone_identifier: subnetRefs.length > 0 ? subnetRefs : undefined,
        availability_zones: subnetRefs.length > 0 ? undefined : ['us-east-1a'],
      },
      blocks: [
        {
          type: 'launch_template',
          attrs: { id: ref(`aws_launch_template.${ltName}.id`), version: '$Latest' },
        },
      ],
    },
  ];
}

function dbBlocks(c: Component): HclBlock {
  const p = c.properties ?? {};
  return {
    type: 'resource',
    labels: ['aws_db_instance', tf(c.id)],
    attrs: {
      identifier: c.id.slice(0, 63),
      engine: str(p.engine, 'postgres'),
      engine_version: p.engineVersion ? str(p.engineVersion, '') : undefined,
      instance_class: str(p.instanceClass, 'db.t3.micro'),
      allocated_storage: num(p.allocatedStorageGb, 20),
      username: 'dbadmin',
      manage_master_user_password: true,
      multi_az: typeof p.multiAz === 'boolean' ? p.multiAz : undefined,
      storage_encrypted: typeof p.storageEncrypted === 'boolean' ? p.storageEncrypted : true,
      skip_final_snapshot: true,
      tags: ref(`{ Name = ${JSON.stringify(c.name)} }`),
    },
  };
}

function s3Blocks(c: Component): HclBlock {
  return {
    type: 'resource',
    labels: ['aws_s3_bucket', tf(c.id)],
    attrs: { bucket: c.id.slice(0, 63), tags: nameTag(c) },
  };
}

function sqsBlocks(c: Component): HclBlock {
  const fifo = c.properties?.fifo === true;
  return {
    type: 'resource',
    labels: ['aws_sqs_queue', tf(c.id)],
    attrs: {
      name: fifo ? `${c.id}.fifo` : c.id,
      fifo_queue: fifo || undefined,
      message_retention_seconds: c.properties?.messageRetentionSeconds !== undefined ? num(c.properties.messageRetentionSeconds, 345600) : undefined,
      tags: nameTag(c),
    },
  };
}

function snsBlocks(c: Component): HclBlock {
  const fifo = c.properties?.fifo === true;
  return {
    type: 'resource',
    labels: ['aws_sns_topic', tf(c.id)],
    attrs: { name: fifo ? `${c.id}.fifo` : c.id, fifo_topic: fifo || undefined, tags: nameTag(c) },
  };
}

function dynamoBlocks(c: Component): HclBlock {
  const hashKey = str(c.properties?.hashKey, 'id');
  return {
    type: 'resource',
    labels: ['aws_dynamodb_table', tf(c.id)],
    attrs: { name: c.id, billing_mode: 'PAY_PER_REQUEST', hash_key: hashKey, tags: nameTag(c) },
    blocks: [{ type: 'attribute', attrs: { name: hashKey, type: 'S' } }],
  };
}

function cacheBlocks(c: Component): HclBlock {
  return {
    type: 'resource',
    labels: ['aws_elasticache_cluster', tf(c.id)],
    attrs: {
      cluster_id: c.id.slice(0, 50),
      engine: 'redis',
      node_type: str(c.properties?.nodeType, 'cache.t3.micro'),
      num_cache_nodes: num(c.properties?.numCacheNodes, 1),
      tags: nameTag(c),
    },
  };
}

function kmsBlocks(c: Component): HclBlock {
  return {
    type: 'resource',
    labels: ['aws_kms_key', tf(c.id)],
    attrs: {
      description: c.name,
      deletion_window_in_days: num(c.properties?.deletionWindowDays, 30),
      enable_key_rotation: typeof c.properties?.keyRotation === 'boolean' ? c.properties.keyRotation : true,
      tags: nameTag(c),
    },
  };
}

function secretBlocks(c: Component): HclBlock {
  return {
    type: 'resource',
    labels: ['aws_secretsmanager_secret', tf(c.id)],
    attrs: {
      name: c.id,
      recovery_window_in_days: c.properties?.recoveryWindowDays !== undefined ? num(c.properties.recoveryWindowDays, 30) : undefined,
      tags: nameTag(c),
    },
  };
}

// Lambda needs an execution role; emit a minimal companion role so the function
// validates standalone. `filename` is referenced (not bundled) — fine for `validate`.
function lambdaBlocks(c: Component): HclBlock[] {
  const roleName = `${tf(c.id)}_role`;
  const assumeRole =
    'jsonencode({ Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }] })';
  return [
    {
      type: 'resource',
      labels: ['aws_iam_role', roleName],
      attrs: { name: `${c.id.slice(0, 58)}-role`, assume_role_policy: ref(assumeRole) },
    },
    {
      type: 'resource',
      labels: ['aws_lambda_function', tf(c.id)],
      attrs: {
        function_name: c.id.slice(0, 64),
        role: ref(`aws_iam_role.${roleName}.arn`),
        runtime: str(c.properties?.runtime, 'nodejs20.x'),
        handler: str(c.properties?.handler, 'index.handler'),
        filename: `${c.id}.zip`,
        memory_size: c.properties?.memoryMb !== undefined ? num(c.properties.memoryMb, 256) : undefined,
        timeout: c.properties?.timeoutSeconds !== undefined ? num(c.properties.timeoutSeconds, 30) : undefined,
        tags: nameTag(c),
      },
    },
  ];
}

const VERSIONS_TF = `terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
`;

const PROVIDERS_TF = `provider "aws" {
  region = var.region
}
`;

const VARIABLES_TF = `variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}
`;

const BACKEND_TF = `# Remote state is intentionally left unconfigured (the prototype uses local state).
# Configure a backend before applying in CI/CD, e.g.:
#
# terraform {
#   backend "s3" {
#     bucket = "my-tfstate-bucket"
#     key    = "cloud-architect/terraform.tfstate"
#     region = "us-east-1"
#   }
# }
`;

function assembleFiles(model: CamlDocument, built: Built, groupById: Map<string, Group>): Record<string, string> {
  const files: Record<string, string> = {
    'versions.tf': VERSIONS_TF,
    'providers.tf': PROVIDERS_TF,
    'variables.tf': VARIABLES_TF,
    'backend.tf': BACKEND_TF,
  };

  // Per-group file layout: each top-level group gets its own .tf; root-level
  // resources land in main.tf.
  for (const [rootId, blocks] of built.blocksByRoot) {
    if (blocks.length === 0) continue;
    const group = rootId ? groupById.get(rootId) : undefined;
    const fileName = group ? `${tf(group.id)}.tf` : 'main.tf';
    const header = group ? `# ${group.name} (${group.kind})\n\n` : `# Top-level resources\n\n`;
    files[fileName] = header + emitAll(blocks);
  }

  files['README.md'] = renderReadme(model, files);
  return files;
}

function renderReadme(model: CamlDocument, files: Record<string, string>): string {
  const tfFiles = Object.keys(files)
    .filter((f) => f.endsWith('.tf'))
    .sort()
    .map((f) => `- \`${f}\``)
    .join('\n');
  return `# ${model.name} — Terraform

Generated from CAML by Cloud Architect Copilot (doc 03 §3.9). Resources cover the
working catalog (VPC, subnet, ALB, EC2 ASG, RDS).

## Files
${tfFiles}

## Usage
\`\`\`bash
terraform init
terraform plan
terraform apply
\`\`\`

> Master DB credentials use \`manage_master_user_password\` (AWS Secrets Manager).
> Launch templates ship without an AMI — set \`image_id\` before \`apply\`.
`;
}
