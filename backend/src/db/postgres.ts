import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { Pool, type QueryResult, type QueryResultRow } from 'pg'
import { generateApiKey, hashApiKey } from '../keys'
import { DEV_ORGANIZATION_ID, DEV_PROJECT_ID, type ProjectScope } from '../types'

const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/tracelyt'

export class PostgresConfigDB {
  private readonly pool: Pool
  private closed = false

  constructor(connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL) {
    this.pool = new Pool({ connectionString })
  }

  async connect(): Promise<void> {
    await this.pool.query('SELECT 1')
    console.log('[PostgreSQL] Connected')
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const directory = path.join(process.cwd(), 'migrations', 'postgres')
    const files = readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      const applied = await this.pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file])
      if ((applied.rowCount ?? 0) > 0) continue
      const sql = readFileSync(path.join(directory, file), 'utf8')
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  }

  async findActiveKey(apiKey: string): Promise<ProjectScope | null> {
    const result = await this.pool.query<{ organization_id: string; project_id: string }>(
      `SELECT p.organization_id, p.id AS project_id
       FROM api_keys k
       JOIN projects p ON p.id = k.project_id
       WHERE k.key_hash = $1
         AND k.revoked_at IS NULL`,
      [hashApiKey(apiKey)],
    )
    const row = result.rows[0]
    if (!row) return null
    return { organizationId: row.organization_id, projectId: row.project_id }
  }

  async seedDevProject(): Promise<{ organizationId: string; projectId: string; apiKey?: string }> {
    await this.pool.query(
      `INSERT INTO organizations (id, name)
       VALUES ($1, 'ACSI')
       ON CONFLICT (id) DO NOTHING`,
      [DEV_ORGANIZATION_ID],
    )
    await this.pool.query(
      `INSERT INTO projects (id, organization_id, name, slug)
       VALUES ($1, $2, 'Eurocampings GraphQL', 'eurocampings-graphql')
       ON CONFLICT (id) DO NOTHING`,
      [DEV_PROJECT_ID, DEV_ORGANIZATION_ID],
    )

    const existing = await this.pool.query(
      `SELECT id FROM api_keys WHERE project_id = $1 AND revoked_at IS NULL LIMIT 1`,
      [DEV_PROJECT_ID],
    )
    if ((existing.rowCount ?? 0) > 0) {
      return { organizationId: DEV_ORGANIZATION_ID, projectId: DEV_PROJECT_ID }
    }

    const generated = generateApiKey()
    await this.pool.query(
      `INSERT INTO api_keys (project_id, key_hash, prefix)
       VALUES ($1, $2, $3)`,
      [DEV_PROJECT_ID, generated.hash, generated.prefix],
    )
    return {
      organizationId: DEV_ORGANIZATION_ID,
      projectId: DEV_PROJECT_ID,
      apiKey: generated.raw,
    }
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.pool.end()
  }
}

export const pgClient = new PostgresConfigDB()
