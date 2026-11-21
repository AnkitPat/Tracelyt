import 'dotenv/config'
import { clickhouseClient } from './db/clickhouse'
import { pgClient } from './db/postgres'

export async function migrate(): Promise<void> {
  await pgClient.migrate()
  await clickhouseClient.ensureSchema()
}

if (process.argv[1]?.includes('migrate')) {
  migrate()
    .then(async () => {
      await pgClient.close()
      await clickhouseClient.close()
    })
    .catch(async (error) => {
      console.error(error)
      await pgClient.close().catch(() => undefined)
      await clickhouseClient.close().catch(() => undefined)
      process.exit(1)
    })
}
