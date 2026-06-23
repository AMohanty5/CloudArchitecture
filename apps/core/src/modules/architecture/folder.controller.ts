import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FolderService } from './folder.service';
import { CreateFolderDto, UpdateFolderDto } from './dto';

@ApiTags('folders')
@Controller('folders')
export class FolderController {
  constructor(private readonly service: FolderService) {}

  @Get()
  @ApiOkResponse({ description: 'List folders with their architecture counts, alphabetical.' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOkResponse({ description: 'Create a folder. 409 on a duplicate name.' })
  create(@Body() body: CreateFolderDto) {
    return this.service.create(body.name);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Rename a folder. 404 if absent, 409 on a duplicate name.' })
  rename(@Param('id') id: string, @Body() body: UpdateFolderDto) {
    return this.service.rename(id, body.name);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOkResponse({ description: 'Delete a folder; its architectures are unfiled (folder_id -> NULL).' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
