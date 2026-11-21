import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApolloLink, Observable, gql } from '@apollo/client/core'
import type { Operation } from '@apollo/client/core'
import { createApolloMonitoringLink } from './apollo'
import { TracelytClient, type ApiEventInput } from './client'

class RecordingClient extends TracelytClient {
  readonly recorded: ApiEventInput[] = []

  constructor() {
    super({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      serviceName: 'eurocampings-graphql',
      flushIntervalMs: 0,
    })
  }

  override record(input: ApiEventInput): void {
    this.recorded.push(input)
  }
}

function run(link: ApolloLink, operation: Operation): Promise<void> {
  return new Promise((resolve, reject) => {
    link.request(operation)?.subscribe({
      next() {},
      error: reject,
      complete: () => resolve(),
    })
  })
}

function operation(partial: {
  name: string
  query: ReturnType<typeof gql>
  variables?: Record<string, unknown>
  status?: number
}): Operation {
  const context = { response: { status: partial.status ?? 200 } }
  return {
    operationName: partial.name,
    query: partial.query,
    variables: partial.variables ?? {},
    extensions: {},
    setContext: () => context,
    getContext: () => context,
  } as Operation
}

describe('createApolloMonitoringLink', () => {
  it('records a completed operation that contains GraphQL errors and omits variables', async () => {
    const client = new RecordingClient()
    const link = ApolloLink.from([
      createApolloMonitoringLink(client),
      new ApolloLink(() =>
        Observable.of({
          data: { campsites: [] },
          errors: [{ message: 'Availability timeout' }],
        }),
      ),
    ])

    await run(link, operation({
      name: 'SearchCampsites',
      query: gql`query SearchCampsites($secret: String) { campsites }`,
      variables: { secret: 'do-not-send' },
    }))

    assert.equal(client.recorded.length, 1)
    const event = client.recorded[0]
    assert.equal(event.operationName, 'SearchCampsites')
    assert.equal(event.operationType, 'query')
    assert.equal(event.networkError, false)
    assert.equal(event.graphqlErrorCount, 1)
    assert.equal(event.httpStatus, 200)
    assert.equal(event.errorMessage, 'Availability timeout')
    assert.equal(event.durationMs >= 0, true)
    assert.equal(JSON.stringify(event).includes('do-not-send'), false)
    assert.equal(JSON.stringify(event).includes('variables'), false)
    client.stop()
  })

  it('records a network error with the elapsed duration', async () => {
    const client = new RecordingClient()
    const link = ApolloLink.from([
      createApolloMonitoringLink(client),
      new ApolloLink(() => new Observable((observer) => observer.error(new Error('socket hang up')))),
    ])

    await assert.rejects(() => run(link, operation({
      name: 'GetCampingDetails',
      query: gql`mutation GetCampingDetails { save }`,
      status: 503,
    })))

    assert.equal(client.recorded.length, 1)
    assert.equal(client.recorded[0].networkError, true)
    assert.equal(client.recorded[0].operationType, 'mutation')
    assert.equal(client.recorded[0].httpStatus, 503)
    assert.equal(client.recorded[0].errorMessage, 'socket hang up')
    client.stop()
  })

  it('records a cancellation when the subscription ends before completion', () => {
    const client = new RecordingClient()
    const link = ApolloLink.from([
      createApolloMonitoringLink(client),
      new ApolloLink(() => new Observable(() => {})),
    ])
    const subscription = link.request(operation({
      name: 'GetNavigation',
      query: gql`subscription GetNavigation { nav }`,
    }))?.subscribe({ next() {} })

    subscription?.unsubscribe()
    assert.equal(client.recorded.length, 1)
    assert.equal(client.recorded[0].operationType, 'subscription')
    assert.equal(client.recorded[0].networkError, true)
    assert.equal(client.recorded[0].errorMessage, 'cancelled')
    client.stop()
  })
})
