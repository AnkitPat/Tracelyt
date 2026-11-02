import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// OpenTelemetry Tracing Initialization Stub
export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  try {
    sdk.start();
    console.log(`[OpenTelemetry] Tracing initialized for ${serviceName}`);
  } catch (error) {
    console.error('[OpenTelemetry] Failed to initialize tracing:', error);
  }

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[OpenTelemetry] SDK shut down successfully'))
      .catch((error) => console.log('[OpenTelemetry] Error shutting down SDK', error))
      .finally(() => process.exit(0));
  });
}
