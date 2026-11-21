import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { buildApp } from '../app'
import { clickhouseClient } from './clickhouse'
import { pgClient } from './postgres'
import { hashApiKey } from '../keys'
import { migrate } from '../migrate'
import type { StoredApiEvent } from '../types'

describe('ClickHouse and Postgres storage', () => {
  const organizationId = randomUUID()
  const projectId = randomUUID()
  const apiKey = `tl_${randomUUID()}`

  before(async () => {
    await migrate()
    await pgClient.query(
      'INSERT INTO organizations (id, name) VALUES ($1, $2)',
      [organizationId, 'Storage test'],
    )
    await pgClient.query(
      'INSERT INTO projects (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)',
      [projectId, organizationId, 'Storage', `storage-${projectId.slice(0, 8)}`],
    )
    await pgClient.query(
      'INSERT INTO api_keys (project_id, key_hash, prefix) VALUES ($1, $2, $3)',
      [projectId, hashApiKey(apiKey), 'test'],
    )
  })

  after(async () => {
    await pgClient.close()
    await clickhouseClient.close()
  })

  it('looks up an active key and ignores a revoked key', async () => {
    const found = await pgClient.findActiveKey(apiKey)
    assert.deepEqual(found, { organizationId, projectId })

    await pgClient.query('UPDATE api_keys SET revoked_at = now() WHERE key_hash = $1', [hashApiKey(apiKey)])
    assert.equal(await pgClient.findActiveKey(apiKey), null)
    await pgClient.query('UPDATE api_keys SET revoked_at = NULL WHERE key_hash = $1', [hashApiKey(apiKey)])
  })

  it('inserts a batch and reads it back without sensitive fields', async () => {
    const event: StoredApiEvent = {
      organizationId,
      projectId,
      timestamp: new Date().toISOString(),
      serviceName: 'eurocampings-graphql',
      operationName: 'SearchCampsites',
      operationType: 'query',
      durationMs: 2800,
      httpStatus: 200,
      graphqlErrorCount: 1,
      networkError: false,
      errorMessage: 'e'.repeat(500),
      traceId: 'trace-8f31a9',
      spanId: 'span-1',
    }
    await clickhouseClient.insertEvents([event])
    const rows = await clickhouseClient.listEvents(projectId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].operationName, 'SearchCampsites')
    assert.equal(rows[0].durationMs, 2800)
    assert.equal(rows[0].graphqlErrorCount, 1)
    assert.equal(rows[0].networkError, false)
    assert.equal(rows[0].errorMessage?.length, 500)
    assert.equal(rows[0].traceId, 'trace-8f31a9')
    assert.equal(rows[0].organizationId, organizationId)
    assert.equal(JSON.stringify(rows[0]).includes('variables'), false)
  })

  it('accepts an authorized batch over HTTP and rejects a bad key', async () => {
    const app = buildApp({
      findActiveKey: (key) => pgClient.findActiveKey(key),
      insertEvents: (events) => clickhouseClient.insertEvents(events),
      queryMetrics: (scope) => clickhouseClient.queryMetrics(scope),
    })
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: 'Bearer not-a-real-key' },
      payload: {
        events: [{
          timestamp: new Date().toISOString(),
          serviceName: 'eurocampings-graphql',
          operationName: 'GetNavigation',
          operationType: 'query',
          durationMs: 10,
          httpStatus: 200,
          graphqlErrorCount: 0,
          networkError: false,
        }],
      },
    })
    assert.equal(rejected.statusCode, 401)

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        events: [{
          timestamp: new Date().toISOString(),
          serviceName: 'eurocampings-graphql',
          operationName: 'GetNavigation',
          operationType: 'query',
          durationMs: 120,
          httpStatus: 200,
          graphqlErrorCount: 0,
          networkError: false,
          variables: { password: 'super-secret-password' },
          authorization: 'Bearer hidden',
        }],
      },
    })
    assert.equal(accepted.statusCode, 202)
    const rows = await clickhouseClient.listEvents(projectId)
    const navigation = rows.find((row) => row.operationName === 'GetNavigation')
    assert.ok(navigation)
    assert.equal(navigation?.durationMs, 120)
    assert.equal(JSON.stringify(rows).includes('super-secret-password'), false)
    await app.close()
  })
})
