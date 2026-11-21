import {
  MAX_ERROR_MESSAGE_LENGTH,
  type ApiEvent,
  type OperationType,
} from './contract'

export interface TracelytOptions {
  endpoint: string
  apiKey: string
  serviceName: string
  flushIntervalMs?: number
  flushSize?: number
  fetchImpl?: typeof fetch
}

export interface ApiEventInput {
  timestamp?: string
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

export class TracelytClient {
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly serviceName: string
  private readonly flushSize: number
  private readonly fetchImpl: typeof fetch
  private buffer: ApiEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private chain: Promise<void> = Promise.resolve()

  constructor(options: TracelytOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.serviceName = options.serviceName
    this.flushSize = options.flushSize ?? 20
    this.fetchImpl = options.fetchImpl ?? fetch
    const intervalMs = options.flushIntervalMs ?? 5000
    if (intervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flush()
      }, intervalMs)
      this.timer.unref?.()
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      watchPageHide(this, window)
    }
  }

  record(input: ApiEventInput): void {
    const event: ApiEvent = {
      timestamp: input.timestamp ?? new Date().toISOString(),
      serviceName: this.serviceName,
      operationName: input.operationName,
      operationType: input.operationType,
      durationMs: input.durationMs,
      httpStatus: input.httpStatus,
      graphqlErrorCount: input.graphqlErrorCount,
      networkError: input.networkError,
    }
    if (input.errorMessage) {
      event.errorMessage = input.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    }
    if (input.traceId) event.traceId = input.traceId
    if (input.spanId) event.spanId = input.spanId
    this.buffer.push(event)
    if (this.buffer.length >= this.flushSize) {
      void this.flush()
    }
  }

  flush(): Promise<void> {
    const run = this.chain.then(() => this.sendBuffer())
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async sendBuffer(): Promise<void> {
    if (this.buffer.length === 0) return
    const events = this.buffer.splice(0, this.buffer.length)
    try {
      const response = await this.fetchImpl(`${this.endpoint}/api/v1/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ events }),
      })
      if (!response.ok) {
        this.buffer.unshift(...events)
        console.error('[Tracelyt SDK] Ingest failed', response.status)
      }
    } catch (error) {
      this.buffer.unshift(...events)
      console.error('[Tracelyt SDK] Failed to send events', error)
    }
  }
}

export function watchPageHide(client: { flush: () => Promise<void> }, target: EventTarget): void {
  target.addEventListener('pagehide', () => {
    void client.flush()
  })
}
