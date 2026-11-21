import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_BATCH_SIZE } from '@tracelyt/sdk'
import { validateBatch } from './validate'

function event(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: '2026-11-13T12:00:00.000Z',
    serviceName: 'eurocampings-graphql',
    operationName: 'SearchCampsites',
    operationType: 'query',
    durationMs: 420,
    httpStatus: 200,
    graphqlErrorCount: 0,
    networkError: false,
    ...overrides,
  }
}

describe('validateBatch', () => {
  it('accepts a valid event and drops sensitive fields', () => {
    const result = validateBatch({
      events: [event({
        variables: { password: 'secret' },
        authorization: 'Bearer hidden',
        cookie: 'session=1',
        errorMessage: 'ok',
        traceId: 'abc',
        spanId: 'def',
      })],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.events[0], {
      timestamp: '2026-11-13T12:00:00.000Z',
      serviceName: 'eurocampings-graphql',
      operationName: 'SearchCampsites',
      operationType: 'query',
      durationMs: 420,
      httpStatus: 200,
      graphqlErrorCount: 0,
      networkError: false,
      errorMessage: 'ok',
      traceId: 'abc',
      spanId: 'def',
    })
  })

  it('truncates long error messages', () => {
    const result = validateBatch({ events: [event({ errorMessage: 'e'.repeat(800) })] })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.events[0].errorMessage?.length, 500)
  })

  it('reports the index of the first invalid event', () => {
    const result = validateBatch({
      events: [event(), event({ operationType: 'Query' })],
    })
    assert.deepEqual(result, {
      ok: false,
      index: 1,
      message: 'operationType must be query, mutation, or subscription',
    })
  })

  it('rejects an oversized batch', () => {
    const result = validateBatch({ events: Array.from({ length: MAX_BATCH_SIZE + 1 }, () => event()) })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.index, -1)
  })

  it('rejects a negative duration', () => {
    const result = validateBatch({ events: [event({ durationMs: -1 })] })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.index, 0)
  })
})
