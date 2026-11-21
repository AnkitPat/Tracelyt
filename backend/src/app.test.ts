import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { buildApp } from './app'
import type { AppDeps, MetricsResponse, StoredApiEvent } from './types'

const scope = { organizationId: 'org-1', projectId: 'proj-1' }

function event() {
  return {
    timestamp: '2026-11-13T12:00:00.000Z',
    serviceName: 'eurocampings-graphql',
    operationName: 'SearchCampsites',
    operationType: 'query',
    durationMs: 420,
    httpStatus: 200,
    graphqlErrorCount: 0,
    networkError: false,
  }
}

function metrics(): MetricsResponse {
  return {
    projectId: scope.projectId,
    window: '5m',
    summary: {
      requestCount: 2,
      avgMs: 400,
      p50Ms: 400,
      p95Ms: 800,
      p99Ms: 800,
      errorRate: 0.5,
    },
    operations: [],
  }
}

describe('ingest and metrics routes', () => {
  const stored: StoredApiEvent[] = []
  const deps: AppDeps = {
    async findActiveKey(apiKey) {
      if (apiKey === 'good-key') return scope
      return null
    },
    async insertEvents(events) {
      stored.push(...events)
    },
    async queryMetrics() {
      return metrics()
    },
  }
  const app = buildApp(deps)

  after(async () => {
    await app.close()
  })

  it('rejects a missing API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: { events: [event()] },
    })
    assert.equal(response.statusCode, 401)
  })

  it('rejects an unknown API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: 'Bearer nope' },
      payload: { events: [event()] },
    })
    assert.equal(response.statusCode, 401)
  })

  it('stores a valid batch under the key project and drops variables', async () => {
    stored.length = 0
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: 'Bearer good-key' },
      payload: {
        events: [{
          ...event(),
          variables: { password: 'super-secret-password' },
          authorization: 'Bearer hidden',
          organizationId: 'attacker',
          projectId: 'attacker',
        }],
      },
    })
    assert.equal(response.statusCode, 202)
    assert.equal(stored.length, 1)
    assert.equal(stored[0].organizationId, 'org-1')
    assert.equal(stored[0].projectId, 'proj-1')
    assert.equal(JSON.stringify(stored[0]).includes('super-secret-password'), false)
    assert.equal(JSON.stringify(stored[0]).includes('hidden'), false)
  })

  it('returns the failing event index', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: 'Bearer good-key' },
      payload: { events: [event(), { ...event(), durationMs: -5 }] },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      error: 'Invalid event',
      index: 1,
      message: 'durationMs must be a non-negative number',
    })
  })

  it('rejects a batch larger than 100 events', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: 'Bearer good-key' },
      payload: { events: Array.from({ length: 101 }, () => event()) },
    })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().index, -1)
  })

  it('returns metrics only for the key project', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/other-project/metrics?window=5m',
      headers: { authorization: 'Bearer good-key' },
    })
    assert.equal(forbidden.statusCode, 403)

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/proj-1/metrics?window=5m',
      headers: { authorization: 'Bearer good-key' },
    })
    assert.equal(allowed.statusCode, 200)
    assert.equal(allowed.json().summary.errorRate, 0.5)
    assert.equal(allowed.json().summary.p95Ms, 800)
  })

  it('serves health', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().status, 'ok')
  })
})
