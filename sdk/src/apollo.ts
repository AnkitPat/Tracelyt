import { ApolloLink, Observable, type FetchResult, type Operation } from '@apollo/client/core'
import type { TracelytClient } from './client'
import type { OperationType } from './contract'

function elapsedMs(start: number): number {
  const current = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return current - start
}

function readOperationType(operation: Operation): OperationType {
  for (const definition of operation.query.definitions) {
    if (definition.kind === 'OperationDefinition') {
      return definition.operation
    }
  }
  return 'query'
}

function statusCode(operation: Operation, fallback: number): number {
  const response = operation.getContext().response as { status?: number } | undefined
  return typeof response?.status === 'number' ? response.status : fallback
}

function record(
  client: TracelytClient,
  operation: Operation,
  durationMs: number,
  networkError: boolean,
  graphqlErrorCount: number,
  errorMessage: string | undefined,
  fallbackStatus: number,
): void {
  client.record({
    operationName: operation.operationName || 'anonymous',
    operationType: readOperationType(operation),
    durationMs,
    httpStatus: statusCode(operation, fallbackStatus),
    graphqlErrorCount,
    networkError,
    errorMessage,
  })
}

export function createApolloMonitoringLink(client: TracelytClient): ApolloLink {
  return new ApolloLink((operation, forward) => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
    let settled = false
    let graphqlErrorCount = 0
    let errorMessage: string | undefined

    return new Observable((observer) => {
      const subscription = forward(operation).subscribe({
        next(result: FetchResult) {
          graphqlErrorCount = result.errors?.length ?? 0
          if (graphqlErrorCount > 0) {
            errorMessage = result.errors!
              .map((error) => error.message)
              .join('; ')
              .slice(0, 500)
          }
          observer.next(result)
        },
        error(error: unknown) {
          if (settled) return
          settled = true
          const message = error instanceof Error ? error.message : 'Network error'
          record(client, operation, elapsedMs(start), true, 0, message, 0)
          observer.error(error)
        },
        complete() {
          if (settled) return
          settled = true
          record(client, operation, elapsedMs(start), false, graphqlErrorCount, errorMessage, 200)
          observer.complete()
        },
      })

      return () => {
        if (!settled) {
          settled = true
          record(client, operation, elapsedMs(start), true, 0, 'cancelled', 0)
        }
        subscription.unsubscribe()
      }
    })
  })
}
