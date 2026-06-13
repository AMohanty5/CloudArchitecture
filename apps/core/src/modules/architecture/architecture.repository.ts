import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { CamlDocument } from '@cac/caml';
import { PG_POOL } from '../../database/database.module';
import { DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID } from '../../config/config';
import type { CommitStats } from './stats';

export interface CommitRow {
  hash: string;
  architecture_id: string;
  parent_hashes: string[];
  origin: string;
  message: string;
  model: CamlDocument;
  model_size_bytes: number;
  stats: CommitStats;
  layout: unknown;
  created_at: Date;
}

export interface NewArchitecture {
  id: string;
  name: string;
  description?: string;
  workspaceId?: string;
  defaultBranch: string;
  catalogVersion: string;
}

export interface NewCommit {
  hash: string;
  architectureId: string;
  parentHashes: string[];
  origin: string;
  message: string;
  model: CamlDocument;
  modelSizeBytes: number;
  stats: CommitStats;
  layout: unknown;
}

/** All SQL for the architecture write path (doc 04 tables). */
@Injectable()
export class ArchitectureRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async insertArchitecture(client: PoolClient, a: NewArchitecture): Promise<void> {
    await client.query(
      `INSERT INTO architectures (id, workspace_id, name, description, default_branch, catalog_version, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [a.id, a.workspaceId ?? DEFAULT_WORKSPACE_ID, a.name, a.description ?? null, a.defaultBranch, a.catalogVersion, DEFAULT_USER_ID],
    );
  }

  async insertCommit(client: PoolClient, c: NewCommit): Promise<void> {
    await client.query(
      `INSERT INTO model_commits
         (hash, architecture_id, parent_hashes, origin, message, model, model_size_bytes, stats, layout)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (architecture_id, hash) DO NOTHING`,
      [c.hash, c.architectureId, c.parentHashes, c.origin, c.message, c.model, c.modelSizeBytes, c.stats, c.layout],
    );
  }

  async insertBranch(client: PoolClient, b: { architectureId: string; name: string; headHash: string }): Promise<void> {
    await client.query(
      `INSERT INTO branches (architecture_id, name, head_hash) VALUES ($1, $2, $3)`,
      [b.architectureId, b.name, b.headHash],
    );
  }

  /** Optimistic head move: succeeds only if the head still equals `expected`. */
  async moveBranchHead(
    client: PoolClient,
    architectureId: string,
    name: string,
    expected: string,
    next: string,
  ): Promise<boolean> {
    const res = await client.query(
      `UPDATE branches SET head_hash = $4, updated_at = now()
       WHERE architecture_id = $1 AND name = $2 AND head_hash = $3`,
      [architectureId, name, expected, next],
    );
    return res.rowCount === 1;
  }

  async architectureExists(id: string): Promise<boolean> {
    const res = await this.pool.query('SELECT 1 FROM architectures WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async listArchitectures(): Promise<ArchitectureRow[]> {
    const res = await this.pool.query<ArchitectureRow>(
      `SELECT id, name, description, default_branch, lifecycle, created_at
       FROM architectures ORDER BY created_at DESC`,
    );
    return res.rows;
  }

  async getBranchHead(architectureId: string, name: string): Promise<string | null> {
    const res = await this.pool.query<{ head_hash: string }>(
      'SELECT head_hash FROM branches WHERE architecture_id = $1 AND name = $2',
      [architectureId, name],
    );
    return res.rows[0]?.head_hash ?? null;
  }

  async getCommit(architectureId: string, hash: string): Promise<CommitRow | null> {
    const res = await this.pool.query<CommitRow>(
      'SELECT * FROM model_commits WHERE architecture_id = $1 AND hash = $2',
      [architectureId, hash],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Commit history newest-first, keyset-paginated on (created_at, hash) so it is
   * stable even when commits share a timestamp. Fetches `limit` rows; the caller
   * passes `limit + 1` to detect a next page.
   */
  async listCommits(
    architectureId: string,
    limit: number,
    cursor?: { createdAt: Date; hash: string },
  ): Promise<CommitMetaRow[]> {
    const params: unknown[] = [architectureId, limit];
    let predicate = 'architecture_id = $1';
    if (cursor) {
      predicate += ' AND (created_at, hash) < ($3, $4)';
      params.push(cursor.createdAt, cursor.hash);
    }
    const res = await this.pool.query<CommitMetaRow>(
      `SELECT hash, parent_hashes, origin, message, stats, author_id, created_at
       FROM model_commits WHERE ${predicate}
       ORDER BY created_at DESC, hash DESC LIMIT $2`,
      params,
    );
    return res.rows;
  }
}

export interface ArchitectureRow {
  id: string;
  name: string;
  description: string | null;
  default_branch: string;
  lifecycle: string;
  created_at: Date;
}

export interface CommitMetaRow {
  hash: string;
  parent_hashes: string[];
  origin: string;
  message: string;
  stats: CommitStats;
  author_id: string | null;
  created_at: Date;
}
