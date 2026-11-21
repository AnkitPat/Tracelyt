import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { buildApp } from './app'
import { clickhouseClient } from './db/clickhouse'
import { pgClient } from './db/postgres'
import { hashApiKey } from './keys'
import { migrate } from './migrate'
import type { StoredApiEvent } from './types'

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${actual} is not close to ${expected}`)
}

describe('metrics API', () => {
  const organizationId = randomUUID()
  const projectId = randomUUID()
  const apiKey = `tl_${randomUUID()}`

  before(async () => {
    await migrate()
    await pgClient.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [organizationId, 'Metrics test'])
    await pgClient.query(
      'INSERT INTO projects (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)',
      [projectId, organizationId, 'Metrics', `metrics-${projectId.slice(0, 8)}`],
    )
    await pgClient.query(
      'INSERT INTO api_keys (project_id, key_hash, prefix) VALUES ($1, $2, $3)',
      [projectId, hashApiKey(apiKey), 'metrics'],
    )

    const now = Date.now()
    const events: StoredApiEvent[] = []
    for (let index = 1; index <= 21; index += 1) {
      events.push({
        organizationId,
        projectId,
        timestamp: new Date(now).toISOString(),
        serviceName: 'eurocampings-graphql',
        operationName: 'SearchCampsites',
        operationType: 'query',
        durationMs: index * 100,
        httpStatus: 200,
        graphqlErrorCount: 0,
        networkError: false,
      })
    }
    events.push({
      organizationId,
      projectId,
      timestamp: new Date(now).toISOString(),
      serviceName: 'eurocampings-graphql',
      operationName: 'GetNavigation',
      operationType: 'query',
      durationMs: 50,
      httpStatus: 200,
      graphqlErrorCount: 1,
      networkError: false,
    })
    events.push({
      organizationId,
      projectId,
      timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
      serviceName: 'eurocampings-graphql',
      operationName: 'Ancient',
      operationType: 'query',
      durationMs: 999999,
      httpStatus: 500,
      graphqlErrorCount: 0,
      networkError: true,
    })
    await clickhouseClient.insertEvents(events)
  })

  after(async () => {
    await pgClient.close()
    await clickhouseClient.close()
  })

  it('returns a 5-minute window with exact percentiles and error rate', async () => {
    const app = buildApp({
      findActiveKey: (key) => pgClient.findActiveKey(key),
      insertEvents: (events) => clickhouseClient.insertEvents(events),
      queryMetrics: (scope) => clickhouseClient.queryMetrics(scope),
    })
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/metrics?window=5m`,
      headers: { authorization: `Bearer ${apiKey}` },
    })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.summary.requestCount, 22)
    closeTo(body.summary.errorRate, 1 / 22)
    assert.equal(body.operations.map((operation: { operationName: string }) => operation.operationName).includes('Ancient'), false)

    const search = body.operations.find((operation: { operationName: string }) => operation.operationName === 'SearchCampsites')
    assert.ok(search)
    assert.equal(search.requestCount, 21)
    closeTo(search.avgMs, 1100)
    closeTo(search.p50Ms, 1100)
    closeTo(search.p95Ms, 2000)
    closeTo(search.p99Ms, 2100)
    closeTo(search.errorRate, 0)

    const navigation = body.operations.find((operation: { operationName: string }) => operation.operationName === 'GetNavigation')
    assert.equal(navigation.errorRate, 1)
    assert.equal(body.operations[0].operationName, 'SearchCampsites')
    await app.close()
  })
})
