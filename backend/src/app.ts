import cors from '@fastify/cors'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { aiInvestigator } from './ai/investigator'
import { validateBatch } from './events/validate'
import type { AppDeps, ProjectScope } from './types'

async function authenticate(
  deps: AppDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ProjectScope | null> {
  const header = request.headers.authorization
  const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null
  if (!match || match[1].length > 200) {
    await reply.code(401).send({ error: 'Missing or invalid API key' })
    return null
  }
  const scope = await deps.findActiveKey(match[1])
  if (!scope) {
    await reply.code(401).send({ error: 'Missing or invalid API key' })
    return null
  }
  return scope
}

export function buildApp(deps: AppDeps, options?: { logger?: boolean }) {
  const app = Fastify({ logger: options?.logger ?? false })
  app.register(cors, { origin: true })

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)
    void reply.code(500).send({ error: 'Internal server error' })
  })

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'tracelyt-backend',
    timestamp: new Date().toISOString(),
  }))

  app.post('/api/v1/events', async (request, reply) => {
    const scope = await authenticate(deps, request, reply)
    if (!scope) return

    const parsed = validateBatch(request.body)
    if (!parsed.ok) {
      return reply.code(400).send({
        error: 'Invalid event',
        index: parsed.index,
        message: parsed.message,
      })
    }

    await deps.insertEvents(parsed.events.map((event) => ({
      ...event,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
    })))
    return reply.code(202).send({ accepted: parsed.events.length })
  })

  app.get('/api/v1/projects/:projectId/metrics', async (request, reply) => {
    const scope = await authenticate(deps, request, reply)
    if (!scope) return

    const { projectId } = request.params as { projectId: string }
    const { window } = request.query as { window?: string }
    if ((window ?? '5m') !== '5m') {
      return reply.code(400).send({ error: 'Only window=5m is supported' })
    }
    if (projectId !== scope.projectId) {
      return reply.code(403).send({ error: 'API key does not belong to this project' })
    }
    return deps.queryMetrics(scope)
  })

  app.post('/api/v1/ai/investigate', async (request) => {
    const body = (request.body ?? {}) as { serviceName?: string; errorContext?: string }
    const analysis = await aiInvestigator.investigateAnomaly(
      body.serviceName || 'unknown-service',
      body.errorContext || 'High latency spike',
    )
    return { analysis }
  })

  return app
}
