export interface TracelytOptions {
  endpoint: string;
  apiKey: string;
  serviceName: string;
}

export class TracelytClient {
  private endpoint: string;
  private apiKey: string;
  private serviceName: string;

  constructor(options: TracelytOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.serviceName = options.serviceName;
  }

  public async captureSpan(name: string, durationMs: number, attributes: Record<string, any> = {}) {
    try {
      await fetch(`${this.endpoint}/api/v1/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          serviceName: this.serviceName,
          spanName: name,
          durationMs,
          attributes,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('[Tracelyt SDK] Failed to send telemetry span:', error);
    }
  }
}
