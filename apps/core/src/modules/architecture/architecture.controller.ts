import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ArchitectureService } from './architecture.service';
import { CommitDto, CreateArchitectureDto } from './dto';

interface HttpReq {
  headers: Record<string, string | string[] | undefined>;
}
interface HttpRes {
  status(code: number): void;
  setHeader(name: string, value: string): void;
}

@ApiTags('architectures')
@Controller('architectures')
export class ArchitectureController {
  constructor(private readonly service: ArchitectureService) {}

  @Post()
  @ApiOkResponse({ description: 'Created with a default `main` branch and an empty initial commit.' })
  create(@Body() body: CreateArchitectureDto) {
    return this.service.create(body);
  }

  @Post(':id/branches/:branch/commits')
  @ApiOkResponse({ description: 'Appended commit. 409 if expectedParent != head; 422 on validation errors.' })
  commit(@Param('id') id: string, @Param('branch') branch: string, @Body() body: CommitDto) {
    return this.service.commit(id, branch, body);
  }

  @Get(':id/branches/:branch/model')
  @ApiOkResponse({ description: 'Resolved head model. ETag = head commit hash; supports If-None-Match (304).' })
  async getModel(
    @Param('id') id: string,
    @Param('branch') branch: string,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<unknown> {
    const { model, hash } = await this.service.getModel(id, branch);
    if (req.headers['if-none-match'] === hash) {
      res.status(304);
      return undefined;
    }
    res.setHeader('ETag', hash);
    res.setHeader('Cache-Control', 'no-cache'); // head moves — revalidate every read
    return model;
  }

  @Get(':id/commits/:hash')
  @ApiOkResponse({ description: 'Immutable commit by hash (content-addressed, cache forever).' })
  async getCommit(
    @Param('id') id: string,
    @Param('hash') hash: string,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<unknown> {
    const commit = await this.service.getCommit(id, hash);
    res.setHeader('ETag', hash);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return commit;
  }
}
