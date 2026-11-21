export const OPERATION_TYPES = ['query', 'mutation', 'subscription'] as const

export type OperationType = (typeof OPERATION_TYPES)[number]

export const MAX_BATCH_SIZE = 100
export const MAX_ERROR_MESSAGE_LENGTH = 500

export interface ApiEvent {
  timestamp: string
  serviceName: string
  operationName: string
  operationType: OperationType
  durationMs: number
  httpStatus: number
  graphqlErrorCount: number
  networkError: boolean
  errorMessage?: string
  traceId?: string
  spanId?: string
}

export interface ApiEventBatch {
  events: ApiEvent[]
}
