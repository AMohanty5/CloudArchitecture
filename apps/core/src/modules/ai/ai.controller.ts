import { Body, Controller, Param, Post, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { GenerationService } from './generation.service';
import { GenerateDto } from './dto';
import type { AiEvent } from './types';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly generation: GenerationService) {}

  @Post('generate')
  @ApiOkResponse({ description: 'Start a generation job (doc 07). Returns a job id; stream stages from /ai/jobs/{id}/stream.' })
  generate(@Body() body: GenerateDto): { jobId: string } {
    return this.generation.createJob({ prompt: body.prompt ?? '', provider: body.provider });
  }

  @Sse('jobs/:id/stream')
  @ApiOkResponse({ description: 'Server-Sent Events stream of pipeline stage + token-accounting events for a job.' })
  stream(@Param('id') id: string): Observable<{ data: AiEvent }> {
    return this.generation.stream(id);
  }
}
