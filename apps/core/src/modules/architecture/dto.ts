import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CamlDocument, JsonPatch } from '@cac/caml';

export class CreateArchitectureDto {
  @ApiProperty({ description: 'Human-readable architecture name.' })
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Workspace id (defaults to the single-tenant workspace).' })
  workspaceId?: string;

  @ApiPropertyOptional({ description: 'Catalog version to pin (defaults to "dev").' })
  catalogVersion?: string;
}

export class UpdateArchitectureDto {
  @ApiPropertyOptional({ description: 'Rename the architecture.' })
  name?: string;

  @ApiPropertyOptional({ description: 'Update the description.' })
  description?: string;

  @ApiPropertyOptional({ description: 'Lifecycle status: draft | in_review | approved | published | archived | template.' })
  lifecycle?: string;

  @ApiPropertyOptional({ type: [String], description: 'Free-form tags (normalized: trimmed, lowercased, deduped, max 12).' })
  tags?: string[];
}

export class DuplicateArchitectureDto {
  @ApiProperty({ description: 'Name for the duplicated architecture.' })
  name!: string;
}

export class CommitDto {
  @ApiProperty({ description: 'Optimistic lock — the commit hash this change is based on. 409 if the head moved.' })
  expectedParent!: string;

  @ApiProperty({ description: 'Commit message.' })
  message!: string;

  @ApiPropertyOptional({ description: 'Full CAML model (mutually exclusive with patch).' })
  model?: CamlDocument;

  @ApiPropertyOptional({ description: 'RFC-6902 patch applied to the parent commit (mutually exclusive with model).' })
  patch?: JsonPatch;

  @ApiPropertyOptional({ description: 'Layout sidecar — positions/sizes, excluded from the content hash.' })
  layout?: unknown;
}
