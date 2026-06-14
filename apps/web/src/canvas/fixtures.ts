import type { CamlComponent, CamlConnection, CamlGroup, ProjectableModel } from './projector';

/**
 * Generate a large, deterministic CAML model for perf testing (blueprint doc 06
 * target: ~1k nodes / 1.5k edges). Components are spread across VPC ⊃ subnet
 * containers with a sparse chain of connections — enough nesting and edges to
 * stress the projector and the canvas.
 */
export function generateLargeModel(componentCount: number): ProjectableModel {
  const groups: CamlGroup[] = [];
  const components: CamlComponent[] = [];
  const connections: CamlConnection[] = [];

  const vpcCount = Math.max(1, Math.round(componentCount / 50));
  const subnetsPerVpc = 2;
  for (let v = 0; v < vpcCount; v++) {
    groups.push({ id: `vpc-${v}`, kind: 'network', name: `VPC ${v}`, provider: 'aws' });
    for (let s = 0; s < subnetsPerVpc; s++) {
      groups.push({ id: `sub-${v}-${s}`, kind: 'subnet', name: `Subnet ${v}.${s}`, parent: `vpc-${v}`, provider: 'aws' });
    }
  }

  for (let i = 0; i < componentCount; i++) {
    const v = i % vpcCount;
    const s = i % subnetsPerVpc;
    components.push({
      id: `c-${i}`,
      type: 'compute.vm.autoscaling_group',
      name: `Service ${i}`,
      group: `sub-${v}-${s}`,
      binding: { provider: 'aws', service: 'aws.ec2_asg' },
    });
    if (i > 0 && i % 3 === 0) {
      connections.push({ id: `e-${i}`, from: `c-${i - 1}`, to: `c-${i}`, kind: 'traffic' });
    }
  }

  return { groups, components, connections };
}
