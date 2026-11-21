import assert from 'node:assert/strict'
import { after, describe, it, mock } from 'node:test'
import { TracelytClient, watchPageHide, type ApiEventInput } from './client'

const sample = (): ApiEventInput => ({
  operationName: 'SearchCampsites',
  operationType: 'query',
  durationMs: 120,
  httpStatus: 200,
  graphqlErrorCount: 0,
  networkError: false,
})

function jsonResponse(status: number): Response {
  return new Response('{}', { status, headers: { 'content-type': 'application/json' } })
}

describe('TracelytClient', () => {
  after(() => {
    mock.timers.reset()
  })

  it('flushes a batch once the buffer reaches the size limit', async () => {
    const bodies: string[] = []
    const client = new TracelytClient({
      endpoint: 'http://localhost:4000/',
      apiKey: 'test-key',
      serviceName: 'eurocampings-graphql',
      flushIntervalMs: 0,
      flushSize: 2,
      fetchImpl: async (input, init) => {
        bodies.push(String(init?.body))
        assert.equal(String(input), 'http://localhost:4000/api/v1/events')
        assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer test-key')
        return jsonResponse(202)
      },
    })

    client.record(sample())
    client.record({ ...sample(), operationName: 'GetNavigation', durationMs: 40 })
    await client.flush()

    assert.equal(bodies.length, 1)
    const payload = JSON.parse(bodies[0]) as { events: Array<Record<string, unknown>> }
    assert.equal(payload.events.length, 2)
    assert.equal(payload.events[0].serviceName, 'eurocampings-graphql')
    assert.equal(payload.events[1].operationName, 'GetNavigation')
    assert.equal(JSON.stringify(payload).includes('variables'), false)
    client.stop()
  })

  it('flushes on the interval', async () => {
    mock.timers.enable({ apis: ['setInterval'] })
    const bodies: string[] = []
    const client = new TracelytClient({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      serviceName: 'eurocampings-graphql',
      flushIntervalMs: 5000,
      flushSize: 20,
      fetchImpl: async (_input, init) => {
        bodies.push(String(init?.body))
        return jsonResponse(202)
      },
    })

    client.record(sample())
    assert.equal(bodies.length, 0)
    mock.timers.tick(5000)
    await client.flush()
    assert.equal(bodies.length, 1)
    client.stop()
    mock.timers.reset()
  })

  it('puts the batch back when ingest fails and retries on the next flush', async () => {
    let calls = 0
    const client = new TracelytClient({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      serviceName: 'eurocampings-graphql',
      flushIntervalMs: 0,
      flushSize: 20,
      fetchImpl: async () => {
        calls += 1
        return jsonResponse(calls === 1 ? 500 : 202)
      },
    })

    client.record(sample())
    await client.flush()
    await client.flush()
    assert.equal(calls, 2)
    client.stop()
  })

  it('truncates error messages before they are sent', async () => {
    let body = ''
    const client = new TracelytClient({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      serviceName: 'eurocampings-graphql',
      flushIntervalMs: 0,
      flushSize: 20,
      fetchImpl: async (_input, init) => {
        body = String(init?.body)
        return jsonResponse(202)
      },
    })
    client.record({ ...sample(), errorMessage: 'x'.repeat(800) })
    await client.flush()
    const payload = JSON.parse(body) as { events: Array<{ errorMessage: string }> }
    assert.equal(payload.events[0].errorMessage.length, 500)
    client.stop()
  })

  it('flushes when the page is hidden', async () => {
    let flushed = 0
    const target = new EventTarget()
    watchPageHide({
      flush: async () => {
        flushed += 1
      },
    }, target)
    target.dispatchEvent(new Event('pagehide'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(flushed, 1)
  })
})
