import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderRepository } from './folder.repository';

const isDuplicate = (err: unknown): boolean =>
  !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505';

/** Flat folders for the Architecture Hub (migration 0005). */
@Injectable()
export class FolderService {
  constructor(private readonly repo: FolderRepository) {}

  async list(): Promise<Array<{ id: string; name: string; count: number; createdAt: Date }>> {
    const rows = await this.repo.list();
    return rows.map((r) => ({ id: r.id, name: r.name, count: r.count, createdAt: r.created_at }));
  }

  async create(name: string): Promise<{ id: string; name: string }> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('a folder name is required');
    try {
      const row = await this.repo.create(randomUUID(), trimmed);
      return { id: row.id, name: row.name };
    } catch (err) {
      if (isDuplicate(err)) throw new ConflictException(`a folder named "${trimmed}" already exists`);
      throw err;
    }
  }

  async rename(id: string, name: string): Promise<{ id: string; name: string }> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('a folder name is required');
    try {
      const row = await this.repo.rename(id, trimmed);
      if (!row) throw new NotFoundException(`folder ${id} not found`);
      return { id: row.id, name: row.name };
    } catch (err) {
      if (isDuplicate(err)) throw new ConflictException(`a folder named "${trimmed}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const ok = await this.repo.remove(id);
    if (!ok) throw new NotFoundException(`folder ${id} not found`);
  }
}
