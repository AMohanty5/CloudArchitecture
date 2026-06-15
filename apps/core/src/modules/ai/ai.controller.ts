import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
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

  @Get('jobs/:id/proposal')
  @ApiOkResponse({ description: 'The generated model held for review (the proposal), for the accept/reject diff UI.' })
  proposal(@Param('id') id: string): { model: unknown; remaining: number } {
    return this.generation.getProposal(id);
  }

  @Post('jobs/:id/accept')
  @ApiOkResponse({ description: 'Accept the proposal: commit the model through the write path and return its architecture id.' })
  accept(@Param('id') id: string, @Body() body: GenerateDto): Promise<{ architectureId: string }> {
    return this.generation.acceptProposal(id, body?.prompt ?? '');
  }

  @Post('jobs/:id/reject')
  @ApiOkResponse({ description: 'Reject the proposal: discard the held model.' })
  reject(@Param('id') id: string): { ok: true } {
    return this.generation.rejectProposal(id);
  }
}
