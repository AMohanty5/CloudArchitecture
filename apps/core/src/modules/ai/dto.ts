import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateDto {
  @ApiProperty({ description: 'Natural-language description of the architecture to generate.' })
  prompt!: string;

  @ApiPropertyOptional({ description: 'Target cloud provider (defaults to aws).', enum: ['aws', 'azure', 'gcp'] })
  provider?: 'aws' | 'azure' | 'gcp';
}
