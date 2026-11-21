import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type { ApiEvent } from '@tracelyt/sdk'
import type { MetricsResponse, OperationMetrics, ProjectScope, StoredApiEvent } from '../types'

const ERROR_CONDITION = 'network_error = 1 OR graphql_error_count > 0 OR http_status >= 400'

export function toClickHouseTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${iso}`)
  }
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
}

export class ApiEventStore {
  private client: ClickHouseClient
  private closed = false
  private readonly url: string
  private readonly username: string
  private readonly password: string
  private readonly database: string

  constructor() {
    this.url = process.env.CLICKHOUSE_URL || 'http://localhost:8123'
    this.username = process.env.CLICKHOUSE_USER || 'default'
    this.password = process.env.CLICKHOUSE_PASSWORD ?? 'tracelyt'
    this.database = process.env.CLICKHOUSE_DATABASE || 'tracelyt'
    if (!/^[A-Za-z0-9_]+$/.test(this.database)) {
      throw new Error('CLICKHOUSE_DATABASE must contain only letters, numbers, and underscores')
    }
    this.client = this.create(this.database)
  }

  private create(database: string): ClickHouseClient {
    return createClient({
      url: this.url,
      username: this.username,
      password: this.password,
      database,
      clickhouse_settings: {
        async_insert: 0,
        wait_for_async_insert: 1,
      },
    })
  }

  async ensureSchema(): Promise<void> {
    const admin = this.create('default')
    try {
      await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${this.database}` })
    } finally {
      await admin.close()
    }
    const sql = readFileSync(path.join(process.cwd(), 'migrations', 'clickhouse', '001_api_events.sql'), 'utf8')
    await this.client.command({ query: sql })
  }

  async insertEvents(events: StoredApiEvent[]): Promise<void> {
    if (events.length === 0) return
    await this.client.insert({
      table: 'api_events',
      format: 'JSONEachRow',
      values: events.map((event) => ({
        organization_id: event.organizationId,
        project_id: event.projectId,
        timestamp: toClickHouseTimestamp(event.timestamp),
        service_name: event.serviceName,
        operation_name: event.operationName,
        operation_type: event.operationType,
        duration_ms: event.durationMs,
        http_status: event.httpStatus,
        graphql_error_count: event.graphqlErrorCount,
        network_error: event.networkError ? 1 : 0,
        error_message: event.errorMessage ?? '',
        trace_id: event.traceId ?? '',
        span_id: event.spanId ?? '',
      })),
    })
  }

  async listEvents(projectId: string): Promise<StoredApiEvent[]> {
    const result = await this.client.query({
      query: `
        SELECT
          organization_id,
          project_id,
          toString(timestamp) AS timestamp,
          service_name,
          operation_name,
          operation_type,
          duration_ms,
          http_status,
          graphql_error_count,
          network_error,
          error_message,
          trace_id,
          span_id
        FROM api_events
        WHERE project_id = {projectId:String}
        ORDER BY timestamp, operation_name
      `,
      query_params: { projectId },
      format: 'JSONEachRow',
    })
    const rows = await result.json<Record<string, unknown>>()
    return rows.map(mapEvent)
  }

  async queryMetrics(scope: ProjectScope): Promise<MetricsResponse> {
    const params = {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
    }
    const where = `
      organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND timestamp >= now64(3) - INTERVAL 5 MINUTE
    `
    const [summaryResult, operationsResult] = await Promise.all([
      this.client.query({
        query: `
          SELECT
            count() AS request_count,
            if(count() = 0, 0, avg(duration_ms)) AS avg_ms,
            if(count() = 0, 0, quantileExact(0.5)(duration_ms)) AS p50_ms,
            if(count() = 0, 0, quantileExact(0.95)(duration_ms)) AS p95_ms,
            if(count() = 0, 0, quantileExact(0.99)(duration_ms)) AS p99_ms,
            if(count() = 0, 0, countIf(${ERROR_CONDITION}) / toFloat64(count())) AS error_rate
          FROM api_events
          WHERE ${where}
        `,
        query_params: params,
        format: 'JSONEachRow',
      }),
      this.client.query({
        query: `
          SELECT
            operation_name,
            count() AS request_count,
            avg(duration_ms) AS avg_ms,
            quantileExact(0.5)(duration_ms) AS p50_ms,
            quantileExact(0.95)(duration_ms) AS p95_ms,
            quantileExact(0.99)(duration_ms) AS p99_ms,
            countIf(${ERROR_CONDITION}) / toFloat64(count()) AS error_rate
          FROM api_events
          WHERE ${where}
          GROUP BY operation_name
          ORDER BY p95_ms DESC, operation_name ASC
        `,
        query_params: params,
        format: 'JSONEachRow',
      }),
    ])

    const summaryRows = await summaryResult.json<Record<string, unknown>>()
    const operationRows = await operationsResult.json<Record<string, unknown>>()
    const summary = summaryRows[0] ?? {}
    const operations: OperationMetrics[] = operationRows.map((row) => ({
      operationName: String(row.operation_name),
      requestCount: numberValue(row.request_count),
      avgMs: numberValue(row.avg_ms),
      p50Ms: numberValue(row.p50_ms),
      p95Ms: numberValue(row.p95_ms),
      p99Ms: numberValue(row.p99_ms),
      errorRate: numberValue(row.error_rate),
    }))

    return {
      projectId: scope.projectId,
      window: '5m',
      summary: {
        requestCount: numberValue(summary.request_count),
        avgMs: numberValue(summary.avg_ms),
        p50Ms: numberValue(summary.p50_ms),
        p95Ms: numberValue(summary.p95_ms),
        p99Ms: numberValue(summary.p99_ms),
        errorRate: numberValue(summary.error_rate),
      },
      operations,
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.client.close()
  }
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapEvent(row: Record<string, unknown>): StoredApiEvent {
  const event: StoredApiEvent = {
    organizationId: String(row.organization_id),
    projectId: String(row.project_id),
    timestamp: String(row.timestamp),
    serviceName: String(row.service_name),
    operationName: String(row.operation_name),
    operationType: String(row.operation_type) as ApiEvent['operationType'],
    durationMs: numberValue(row.duration_ms),
    httpStatus: numberValue(row.http_status),
    graphqlErrorCount: numberValue(row.graphql_error_count),
    networkError: numberValue(row.network_error) === 1,
  }
  const errorMessage = String(row.error_message ?? '')
  const traceId = String(row.trace_id ?? '')
  const spanId = String(row.span_id ?? '')
  if (errorMessage) event.errorMessage = errorMessage
  if (traceId) event.traceId = traceId
  if (spanId) event.spanId = spanId
  return event
}

export const clickhouseClient = new ApiEventStore()
