import 'dotenv/config'
import { initTracing } from './tracing'
import { buildApp } from './app'
import { clickhouseClient } from './db/clickhouse'
import { pgClient } from './db/postgres'
import { migrate } from './migrate'

initTracing('tracelyt-backend')

async function start() {
  await migrate()
  await pgClient.connect()
  const app = buildApp({
    findActiveKey: (apiKey) => pgClient.findActiveKey(apiKey),
    insertEvents: (events) => clickhouseClient.insertEvents(events),
    queryMetrics: (scope) => clickhouseClient.queryMetrics(scope),
  }, { logger: true })

  const port = Number(process.env.PORT) || 4000
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Tracelyt backend running on http://localhost:${port}`)
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
