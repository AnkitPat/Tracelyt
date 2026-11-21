import type { ApiEvent } from '@tracelyt/sdk'

export const DEV_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
export const DEV_PROJECT_ID = '00000000-0000-4000-8000-000000000002'

export interface ProjectScope {
  organizationId: string
  projectId: string
}

export interface StoredApiEvent extends ApiEvent {
  organizationId: string
  projectId: string
}

export interface OperationMetrics {
  operationName: string
  requestCount: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  errorRate: number
}

export interface MetricsSummary {
  requestCount: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  errorRate: number
}

export interface MetricsResponse {
  projectId: string
  window: '5m'
  summary: MetricsSummary
  operations: OperationMetrics[]
}

export interface AppDeps {
  findActiveKey: (apiKey: string) => Promise<ProjectScope | null>
  insertEvents: (events: StoredApiEvent[]) => Promise<void>
  queryMetrics: (scope: ProjectScope) => Promise<MetricsResponse>
}
