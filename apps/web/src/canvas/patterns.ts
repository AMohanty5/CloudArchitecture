import type { CamlComponent, CamlConnection } from './projector';

/**
 * Architecture pattern library (Day 105, docs/architecture-intelligence.md §8). Small named
 * *fragments* (not full architectures like `templates.ts`) — the canonical wiring for a
 * recurring shape — inserted into the current canvas via the existing `paste` path (which
 * remaps ids + cascades positions). Referenced from catalog `knowledge.recommendedPatterns`,
 * so the Advisor can drop the right scaffold in one click.
 */

const aws = (service: string) => ({ provider: 'aws', service });

export interface ArchitecturePattern {
  id: string;
  label: string;
  description: string;
  /** A flat CAML fragment (top-level components + their connections); pasted + remapped. */
  fragment: { components: CamlComponent[]; connections: CamlConnection[] };
}

export const PATTERNS: ArchitecturePattern[] = [
  {
    id: 'event-to-store',
    label: 'Event → Store',
    description: 'EventBridge routes through Lambda to write S3 — the supported way to persist bus events.',
    fragment: {
      components: [
        { id: 'bus', type: 'messaging.eventbus', name: 'Event bus', binding: aws('aws.eventbridge') },
        { id: 'writer', type: 'compute.serverless.function', name: 'Writer', binding: aws('aws.lambda') },
        { id: 'store', type: 'storage.object', name: 'Bucket', binding: aws('aws.s3'), properties: { storageEncrypted: true } },
      ],
      connections: [
        { id: 'bus-writer', from: 'bus', to: 'writer', kind: 'async' },
        { id: 'writer-store', from: 'writer', to: 'store', kind: 'data' },
      ],
    },
  },
  {
    id: 'event-fanout',
    label: 'Event Fan-out',
    description: 'EventBridge → SNS fans out to a queue and a function.',
    fragment: {
      components: [
        { id: 'bus', type: 'messaging.eventbus', name: 'Event bus', binding: aws('aws.eventbridge') },
        { id: 'topic', type: 'messaging.topic', name: 'Fan-out topic', binding: aws('aws.sns') },
        { id: 'queue', type: 'messaging.queue', name: 'Worker queue', binding: aws('aws.sqs') },
        { id: 'fn', type: 'compute.serverless.function', name: 'Subscriber', binding: aws('aws.lambda') },
      ],
      connections: [
        { id: 'bus-topic', from: 'bus', to: 'topic', kind: 'async' },
        { id: 'topic-queue', from: 'topic', to: 'queue', kind: 'async' },
        { id: 'topic-fn', from: 'topic', to: 'fn', kind: 'async' },
      ],
    },
  },
  {
    id: 'alarm-fanout',
    label: 'Alarm Fan-out',
    description: 'CloudWatch alarms notify an SNS topic that triggers a remediation function.',
    fragment: {
      components: [
        { id: 'cw', type: 'observability.metrics', name: 'CloudWatch', binding: aws('aws.cloudwatch') },
        { id: 'topic', type: 'messaging.topic', name: 'Alerts', binding: aws('aws.sns') },
        { id: 'fn', type: 'compute.serverless.function', name: 'Responder', binding: aws('aws.lambda') },
      ],
      connections: [
        { id: 'cw-topic', from: 'cw', to: 'topic', kind: 'async' },
        { id: 'topic-fn', from: 'topic', to: 'fn', kind: 'async' },
      ],
    },
  },
  {
    id: 'assume-role',
    label: 'Assume Role',
    description: 'An IAM role attached to a function — grant access through the compute that assumes it.',
    fragment: {
      components: [
        { id: 'role', type: 'security.identity.principal', name: 'App role', binding: aws('aws.iam_role') },
        { id: 'fn', type: 'compute.serverless.function', name: 'App', binding: aws('aws.lambda') },
      ],
      connections: [{ id: 'role-fn', from: 'role', to: 'fn', kind: 'identity' }],
    },
  },
];

export const PATTERNS_BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
