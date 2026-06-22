import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ArchitectureService } from './architecture.service';
import { CommitDto, CreateArchitectureDto, DuplicateArchitectureDto, UpdateArchitectureDto } from './dto';
import { renderSvg } from '../diagram/api';
import { generateTerraform, zipFiles } from '../iac/api';
import { renderHld, buildArtifacts } from '../artifact/api';

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

  @Get()
  @ApiOkResponse({ description: 'List architectures, newest first.' })
  list() {
    return this.service.listArchitectures();
  }

  @Post()
  @ApiOkResponse({ description: 'Created with a default `main` branch and an empty initial commit.' })
  create(@Body() body: CreateArchitectureDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update metadata (rename / description / lifecycle). 409 on a duplicate name.' })
  update(@Param('id') id: string, @Body() body: UpdateArchitectureDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOkResponse({ description: 'Delete the architecture and all its history.' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/duplicate')
  @ApiOkResponse({ description: 'Copy the head model into a new architecture.' })
  duplicate(@Param('id') id: string, @Body() body: DuplicateArchitectureDto) {
    return this.service.duplicate(id, body.name);
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

  @Get(':id/branches/:branch/layout')
  @ApiOkResponse({ description: 'Layout sidecar (positions/sizes) for the branch head model. ETag = head commit hash.' })
  async getLayout(
    @Param('id') id: string,
    @Param('branch') branch: string,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<unknown> {
    const { commit, layout } = await this.service.getLayout(id, branch);
    res.setHeader('ETag', commit);
    res.setHeader('Cache-Control', 'no-cache'); // head moves — revalidate every read
    return { commit, layout };
  }

  @Get(':id/branches/:branch/export.svg')
  @ApiQuery({ name: 'theme', required: false, description: 'light (default) | dark' })
  @ApiOkResponse({ description: 'Presentation-ready SVG of the branch head model (true vectors).' })
  async exportSvg(
    @Param('id') id: string,
    @Param('branch') branch: string,
    @Query('theme') theme: string | undefined,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<string> {
    const { model } = await this.service.getModel(id, branch);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', 'inline; filename="architecture.svg"');
    return renderSvg(model, { theme: theme === 'dark' ? 'dark' : 'light' });
  }

  @Get(':id/branches/:branch/export.tf.zip')
  @ApiOkResponse({ description: 'Terraform bundle for the branch head model, packaged as a .zip (doc 03 §3.9).' })
  async exportTerraform(
    @Param('id') id: string,
    @Param('branch') branch: string,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<Buffer> {
    const { model } = await this.service.getModel(id, branch);
    const { files } = generateTerraform(model);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="terraform.zip"');
    return zipFiles(files);
  }

  @Get(':id/branches/:branch/export.hld.md')
  @ApiOkResponse({ description: 'High-Level Design document (markdown) for the branch head model (doc 03).' })
  async exportHld(
    @Param('id') id: string,
    @Param('branch') branch: string,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<string> {
    const { model } = await this.service.getModel(id, branch);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hld.md"');
    return renderHld(model);
  }

  @Get(':id/branches/:branch/export.bundle.zip')
  @ApiQuery({ name: 'theme', required: false, description: 'light (default) | dark — applied to the diagram' })
  @ApiOkResponse({ description: 'Everything for the branch head model — diagram + HLD + Terraform — as a single .zip.' })
  async exportBundle(
    @Param('id') id: string,
    @Param('branch') branch: string,
    @Query('theme') theme: string | undefined,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<Buffer> {
    const { model } = await this.service.getModel(id, branch);
    const { files } = buildArtifacts(model, { theme: theme === 'dark' ? 'dark' : 'light' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="architecture-bundle.zip"');
    return zipFiles(files);
  }

  @Get(':id/branches/:branch/validate')
  @ApiOkResponse({ description: 'Advisory validation findings (doc 16 rule pack) for the branch head model. Read-only — never blocks a commit.' })
  async validate(@Param('id') id: string, @Param('branch') branch: string): Promise<unknown> {
    return this.service.validateBranch(id, branch);
  }

  @Get(':id/commits')
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ description: 'Commit history, newest first, keyset-paginated (cursor + nextCursor).' })
  listCommits(@Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.service.listCommits(id, { limit: limit ? Number(limit) : undefined, cursor });
  }

  @Get(':id/diff')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiOkResponse({ description: 'Typed ModelDiff between two refs (commit hash or branch name) + summary.' })
  diff(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.service.diff(id, from, to);
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
