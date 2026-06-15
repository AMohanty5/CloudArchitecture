import { describe, expect, it } from 'vitest';
import { generateTerraform } from './terraform';
import type { CamlDocument } from '@cac/caml';

const ecommerce: CamlDocument = {
  camlVersion: '1.0',
  id: 'arch_ECOM',
  name: 'E-commerce',
  groups: [
    { id: 'vpc', kind: 'network', name: 'Main VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } },
    { id: 'sub-a', kind: 'subnet', name: 'App A', parent: 'vpc', provider: 'aws', properties: { cidr: '10.0.1.0/24', zone: 'us-east-1a' } },
    { id: 'sub-b', kind: 'subnet', name: 'App B', parent: 'vpc', provider: 'aws', properties: { cidr: '10.0.2.0/24', zone: 'us-east-1b' } },
  ],
  components: [
    { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'Web LB', binding: { provider: 'aws', service: 'aws.alb' } },
    { id: 'app-asg', type: 'compute.vm.autoscaling_group', name: 'App', group: 'sub-a', binding: { provider: 'aws', service: 'aws.ec2_asg' } },
    { id: 'orders-db', type: 'database.relational', name: 'Orders DB', group: 'sub-a', binding: { provider: 'aws', service: 'aws.rds' }, properties: { engine: 'postgres', instanceClass: 'db.t3.micro', multiAz: true } },
  ],
};

describe('generateTerraform', () => {
  const { files } = generateTerraform(ecommerce);

  it('emits the skeleton files', () => {
    for (const f of ['versions.tf', 'providers.tf', 'variables.tf', 'backend.tf', 'README.md']) expect(files[f]).toBeDefined();
    expect(files['versions.tf']).toContain('hashicorp/aws');
    expect(files['providers.tf']).toContain('region = var.region');
  });

  it('lays resources out per top-level group; ungrouped components go to main.tf', () => {
    expect(files['vpc.tf']).toBeDefined();
    const vpc = files['vpc.tf']!;
    expect(vpc).toContain('resource "aws_vpc" "vpc"');
    expect(vpc).toContain('resource "aws_subnet" "sub_a"');
    // ASG + DB live in sub-a → roll up to the vpc group file
    expect(vpc).toContain('resource "aws_autoscaling_group" "app_asg"');
    expect(vpc).toContain('resource "aws_db_instance" "orders_db"');
    // The ALB is ungrouped → main.tf
    expect(files['main.tf']).toContain('resource "aws_lb" "web_lb"');
  });

  it('wires references (subnet→vpc, asg→subnets) and honours properties', () => {
    const hcl = files['vpc.tf']!;
    expect(hcl).toContain('vpc_id = aws_vpc.vpc.id');
    expect(hcl).toContain('cidr_block = "10.0.0.0/16"');
    expect(hcl).toContain('vpc_zone_identifier = [aws_subnet.sub_a.id, aws_subnet.sub_b.id]');
    expect(hcl).toContain('launch_template {');
    expect(hcl).toContain('multi_az = true');
    expect(hcl).toContain('manage_master_user_password = true');
  });

  it('is deterministic', () => {
    expect(generateTerraform(ecommerce).files).toEqual(files);
  });
});
