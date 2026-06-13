import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogQueryService } from './catalog-query.service';
import { placeholderSvg } from './icons';

interface HttpRes {
  setHeader(name: string, value: string): void;
}

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly query: CatalogQueryService) {}

  @Get('services')
  @ApiQuery({ name: 'q', required: false, description: 'Search query, e.g. "load balancer".' })
  @ApiQuery({ name: 'provider', required: false })
  @ApiOkResponse({ description: 'Ranked palette search results.' })
  search(@Query('q') q?: string, @Query('provider') provider?: string) {
    return this.query.search(q, provider);
  }

  @Get('services/:key')
  @ApiOkResponse({ description: 'Full service definition incl. the property JSON Schema for the form generator.' })
  detail(@Param('key') key: string) {
    return this.query.getService(key);
  }

  @Get('icons/:key')
  @ApiOkResponse({ description: 'Placeholder SVG icon for a service (real icon packs are a Backlog item).' })
  icon(@Param('key') key: string, @Res({ passthrough: true }) res: HttpRes): string {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return placeholderSvg(key);
  }
}
