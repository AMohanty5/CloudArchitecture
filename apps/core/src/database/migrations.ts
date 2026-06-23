/**
 * Ordered, immutable SQL migrations (blueprint doc 04). Embedded as TS so they
 * ship in `dist` and run identically under tsx and node — no file copying.
 * Expand-and-contract only; never edit an applied migration, add a new one.
 *
 * Note vs doc 04: foreign keys to not-yet-created tenancy tables (workspaces) are
 * omitted — those tables arrive in Stage F. `tenant_id` defaults to the
 * single-tenant id and RLS is enabled with the doc-04 tenant_isolation policy.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '0001_init_architecture',
    sql: /* sql */ `
      CREATE TABLE IF NOT EXISTS architectures (
        id              UUID PRIMARY KEY,
        tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
        workspace_id    UUID NOT NULL,
        name            TEXT NOT NULL,
        description     TEXT,
        lifecycle       TEXT NOT NULL DEFAULT 'draft',
        default_branch  TEXT NOT NULL DEFAULT 'main',
        catalog_version TEXT NOT NULL,
        created_by      UUID NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workspace_id, name)
      );

      CREATE TABLE IF NOT EXISTS model_commits (
        hash             CHAR(64) NOT NULL,
        architecture_id  UUID NOT NULL REFERENCES architectures(id),
        tenant_id        UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
        parent_hashes    CHAR(64)[] NOT NULL DEFAULT '{}',
        origin           TEXT NOT NULL,
        message          TEXT NOT NULL,
        rationale        JSONB,
        model            JSONB,
        model_blob_ref   TEXT,
        model_size_bytes INT NOT NULL,
        layout           JSONB,
        stats            JSONB NOT NULL,
        author_id        UUID,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (architecture_id, hash)
      );
      CREATE INDEX IF NOT EXISTS model_commits_arch_created_idx
        ON model_commits (architecture_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS branches (
        architecture_id UUID NOT NULL,
        name            TEXT NOT NULL,
        tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
        head_hash       CHAR(64) NOT NULL,
        kind            TEXT NOT NULL DEFAULT 'design',
        protected       BOOLEAN NOT NULL DEFAULT false,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (architecture_id, name)
      );

      -- Row-Level Security (doc 04): defense in depth. tenant_id matches the
      -- per-connection app.tenant_id GUC. missing_ok so an unset GUC errors safe.
      ALTER TABLE architectures ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON architectures
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE model_commits ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON model_commits
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON branches
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
    `,
  },
  {
    id: '0002_catalog_services',
    sql: /* sql */ `
      -- Published catalog (doc 03 §3.6, doc 14): global (not tenant-scoped), one
      -- row per (version, key). Populated on boot from catalog-as-code content.
      CREATE TABLE IF NOT EXISTS catalog_services (
        version          TEXT NOT NULL,
        key              TEXT NOT NULL,
        provider         TEXT NOT NULL,
        name             TEXT NOT NULL,
        description      TEXT,
        status           TEXT NOT NULL,
        icon             TEXT,
        docs             TEXT,
        abstract_types   TEXT[] NOT NULL DEFAULT '{}',
        group_kind       TEXT,
        capabilities     JSONB NOT NULL DEFAULT '{}',
        properties       JSONB NOT NULL DEFAULT '{}',
        connection_rules JSONB NOT NULL DEFAULT '{}',
        published_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (version, key)
      );
      CREATE INDEX IF NOT EXISTS catalog_services_provider_idx
        ON catalog_services (version, provider);
    `,
  },
  {
    id: '0003_architecture_updated_at',
    sql: /* sql */ `
      -- Last-activity timestamp for the Architecture Hub (sort-by-modified). Touched on
      -- every commit; backfilled to created_at for existing rows.
      ALTER TABLE architectures ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      UPDATE architectures SET updated_at = created_at WHERE updated_at < created_at;
      CREATE INDEX IF NOT EXISTS architectures_updated_idx
        ON architectures (workspace_id, updated_at DESC);
    `,
  },
  {
    id: '0004_architecture_tags',
    sql: /* sql */ `
      -- Free-form tags for the Architecture Hub (organize + filter/search by tag). Stored
      -- normalized (trimmed, deduped, lowercased) by the service; GIN index for tag lookups.
      ALTER TABLE architectures ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
      CREATE INDEX IF NOT EXISTS architectures_tags_idx ON architectures USING GIN (tags);
    `,
  },
];
