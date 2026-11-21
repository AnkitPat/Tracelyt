import {
  MAX_BATCH_SIZE,
  MAX_ERROR_MESSAGE_LENGTH,
  OPERATION_TYPES,
  type ApiEvent,
  type OperationType,
} from '@tracelyt/sdk'

const OPERATION_TYPE_SET = new Set<string>(OPERATION_TYPES)

export type BatchValidation =
  | { ok: true; events: ApiEvent[] }
  | { ok: false; index: number; message: string }

export function validateBatch(body: unknown): BatchValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, index: -1, message: 'Body must be an object with an events array' }
  }

  const events = (body as { events?: unknown }).events
  if (!Array.isArray(events)) {
    return { ok: false, index: -1, message: 'events must be an array' }
  }
  if (events.length === 0) {
    return { ok: false, index: -1, message: 'events must contain at least one event' }
  }
  if (events.length > MAX_BATCH_SIZE) {
    return {
      ok: false,
      index: -1,
      message: `events must contain at most ${MAX_BATCH_SIZE} events`,
    }
  }

  const parsed: ApiEvent[] = []
  for (let index = 0; index < events.length; index += 1) {
    const result = validateEvent(events[index])
    if (!result.ok) return { ok: false, index, message: result.message }
    parsed.push(result.event)
  }
  return { ok: true, events: parsed }
}

function validateEvent(input: unknown): { ok: true; event: ApiEvent } | { ok: false; message: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, message: 'Event must be an object' }
  }

  const record = input as Record<string, unknown>
  const timestamp = requiredString(record.timestamp, 'timestamp', 64)
  if (!timestamp.ok) return timestamp
  const parsedTime = Date.parse(timestamp.value)
  if (Number.isNaN(parsedTime)) {
    return { ok: false, message: 'timestamp must be an ISO-8601 date' }
  }

  const serviceName = requiredString(record.serviceName, 'serviceName', 200)
  if (!serviceName.ok) return serviceName
  const operationName = requiredString(record.operationName, 'operationName', 200)
  if (!operationName.ok) return operationName

  if (typeof record.operationType !== 'string' || !OPERATION_TYPE_SET.has(record.operationType)) {
    return { ok: false, message: 'operationType must be query, mutation, or subscription' }
  }

  const durationMs = record.durationMs
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return { ok: false, message: 'durationMs must be a non-negative number' }
  }

  const httpStatus = record.httpStatus
  if (typeof httpStatus !== 'number' || !Number.isInteger(httpStatus) || httpStatus < 0 || httpStatus > 599) {
    return { ok: false, message: 'httpStatus must be an integer from 0 to 599' }
  }

  const graphqlErrorCount = record.graphqlErrorCount
  if (typeof graphqlErrorCount !== 'number' || !Number.isInteger(graphqlErrorCount) || graphqlErrorCount < 0 || graphqlErrorCount > 65535) {
    return { ok: false, message: 'graphqlErrorCount must be a non-negative integer' }
  }

  const networkError = record.networkError
  if (typeof networkError !== 'boolean') {
    return { ok: false, message: 'networkError must be a boolean' }
  }

  let errorMessage: string | undefined
  if (record.errorMessage !== undefined && record.errorMessage !== null) {
    if (typeof record.errorMessage !== 'string') {
      return { ok: false, message: 'errorMessage must be a string' }
    }
    if (record.errorMessage.length > 0) {
      errorMessage = record.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    }
  }

  const traceId = optionalString(record.traceId, 'traceId', 128)
  if (!traceId.ok) return traceId
  const spanId = optionalString(record.spanId, 'spanId', 128)
  if (!spanId.ok) return spanId

  const event: ApiEvent = {
    timestamp: new Date(parsedTime).toISOString(),
    serviceName: serviceName.value,
    operationName: operationName.value,
    operationType: record.operationType as OperationType,
    durationMs,
    httpStatus,
    graphqlErrorCount,
    networkError,
  }
  if (errorMessage) event.errorMessage = errorMessage
  if (traceId.value) event.traceId = traceId.value
  if (spanId.value) event.spanId = spanId.value
  return { ok: true, event }
}

function requiredString(
  value: unknown,
  name: string,
  max: number,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: `${name} must be a non-empty string` }
  }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    return { ok: false, message: `${name} must be at most ${max} characters` }
  }
  return { ok: true, value: trimmed }
}

function optionalString(
  value: unknown,
  name: string,
  max: number,
): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') return { ok: true }
  if (typeof value !== 'string') return { ok: false, message: `${name} must be a string` }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    return { ok: false, message: `${name} must be at most ${max} characters` }
  }
  return { ok: true, value: trimmed || undefined }
}
