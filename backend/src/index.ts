import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initTracing } from './tracing';
import { pgClient } from './db/postgres';
import { clickhouseClient } from './db/clickhouse';
import { aiInvestigator } from './ai/investigator';

// Initialize OpenTelemetry Tracing
initTracing('tracelyt-backend');

const fastify = Fastify({ logger: true });

// Register CORS
fastify.register(cors, {
  origin: true,
});

// Health check endpoint
fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', service: 'tracelyt-backend', timestamp: new Date().toISOString() };
});

// Ingestion endpoint (REST for telemetry ingestion -> ClickHouse)
fastify.post('/api/v1/telemetry', async (request, reply) => {
  const body = request.body as any;
  
  // Store telemetry in ClickHouse
  await clickhouseClient.insertTelemetryEvent(body);

  return { success: true, ingestedAt: new Date().toISOString() };
});

// Dashboard metrics endpoint
fastify.get('/api/v1/dashboard/metrics', async (request, reply) => {
  // Fetch config from PostgreSQL
  const tenantConfig = await pgClient.getTenantConfig('default-tenant');

  return {
    tenant: tenantConfig.tenantId,
    services: [
      { name: 'auth-service', status: 'healthy', latencyP99: '45ms', errorRate: '0.01%' },
      { name: 'payment-service', status: 'degraded', latencyP99: '320ms', errorRate: '1.2%' },
      { name: 'user-service', status: 'healthy', latencyP99: '28ms', errorRate: '0.00%' },
    ],
    systemMetrics: {
      cpuUsage: '42.5%',
      memoryUsage: '68.1%',
      activeTracesCount: 1420,
    }
  };
});

// AI Investigation endpoint
fastify.post('/api/v1/ai/investigate', async (request, reply) => {
  const { serviceName, errorContext } = request.body as { serviceName: string; errorContext: string };
  const analysis = await aiInvestigator.investigateAnomaly(serviceName || 'unknown-service', errorContext || 'High latency spike');
  return { analysis };
});

const start = async () => {
  try {
    await pgClient.connect();
    await fastify.listen({ port: 4000, host: '0.0.0.0' });
    console.log('Tracelyt backend running on http://localhost:4000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
