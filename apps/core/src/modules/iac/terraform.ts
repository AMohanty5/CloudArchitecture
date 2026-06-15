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

  // --- Components → service resources (the Day-6 five) ---
  for (const c of components) {
    const root = rootGroupId(c.group);
    const service = c.binding?.service;
    if (service === 'aws.alb') push(root, ...albBlocks(c, subnetRefs));
    else if (service === 'aws.ec2_asg') push(root, ...asgBlocks(c, subnetRefs));
    else if (service === 'aws.rds') push(root, dbBlocks(c));
  }

  return { files: assembleFiles(model, built, groupById) };
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
