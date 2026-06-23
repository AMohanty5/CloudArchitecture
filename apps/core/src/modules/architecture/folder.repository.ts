import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { DEFAULT_WORKSPACE_ID } from '../../config/config';

export interface FolderRow {
  id: string;
  name: string;
  created_at: Date;
  count: number; // number of architectures filed under it
}

/** SQL for the Hub's flat folders (migration 0005). */
@Injectable()
export class FolderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Folders with their architecture counts, alphabetical. */
  async list(): Promise<FolderRow[]> {
    const res = await this.pool.query<FolderRow>(
      `SELECT f.id, f.name, f.created_at, COUNT(a.id)::int AS count
       FROM folders f
       LEFT JOIN architectures a ON a.folder_id = f.id
       GROUP BY f.id
       ORDER BY f.name ASC`,
    );
    return res.rows;
  }

  /** Create a folder. A duplicate name raises Postgres 23505 (surfaced as 409). */
  async create(id: string, name: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<FolderRow> {
    const res = await this.pool.query<FolderRow>(
      `INSERT INTO folders (id, workspace_id, name) VALUES ($1, $2, $3)
       RETURNING id, name, created_at, 0 AS count`,
      [id, workspaceId, name],
    );
    return res.rows[0]!;
  }

  /** Rename a folder. Returns null if absent; 23505 on a duplicate name. */
  async rename(id: string, name: string): Promise<FolderRow | null> {
    const res = await this.pool.query<FolderRow>(
      `UPDATE folders SET name = $2 WHERE id = $1 RETURNING id, name, created_at, 0 AS count`,
      [id, name],
    );
    return res.rows[0] ?? null;
  }

  /** Delete a folder (its architectures are unfiled via ON DELETE SET NULL). Returns false if absent. */
  async remove(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM folders WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    const res = await this.pool.query('SELECT 1 FROM folders WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
