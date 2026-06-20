import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogQueryService } from './catalog-query.service';
import { categoryOf, serviceIconSvg } from './icons';

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
  @ApiOkResponse({ description: 'AWS category-tinted SVG icon for a service (official icon packs are a Backlog item).' })
  async icon(@Param('key') key: string, @Res({ passthrough: true }) res: HttpRes): Promise<string> {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Tint by the service's category (from its `icon:` path, else its abstract type).
    // Unknown keys still render — categoryOf falls back to the navy default tile.
    const svc = await this.query.tryGetService(key);
    const category = categoryOf(svc?.icon, svc?.abstractTypes?.[0]);
    return serviceIconSvg(key, category);
  }
}
