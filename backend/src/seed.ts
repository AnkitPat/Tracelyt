import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { migrate } from './migrate'
import { pgClient } from './db/postgres'
import { clickhouseClient } from './db/clickhouse'

function upsertEnv(file: string, values: Record<string, string>) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  let next = current
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    next = pattern.test(next) ? next.replace(pattern, line) : `${next.replace(/\s*$/, '')}\n${line}\n`
  }
  writeFileSync(file, next.replace(/^\n/, ''))
}

async function seed() {
  await migrate()
  const result = await pgClient.seedDevProject()
  const frontendEnv = path.join(process.cwd(), '..', 'frontend', '.env.local')
  const shared = {
    TRACELYT_API_URL: 'http://localhost:4000',
    TRACELYT_PROJECT_ID: result.projectId,
    NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    NEXT_PUBLIC_PROJECT_ID: result.projectId,
  }

  if (result.apiKey) {
    upsertEnv(frontendEnv, { ...shared, TRACELYT_API_KEY: result.apiKey })
    console.log('Dev API key (shown once):')
    console.log(result.apiKey)
    console.log(`Project id: ${result.projectId}`)
    console.log(`Saved to ${frontendEnv}`)
  } else {
    console.log(`Dev project already exists: ${result.projectId}`)
    console.log('The raw API key was printed on the first seed and is stored only as a hash.')
    if (!existsSync(frontendEnv) || !readFileSync(frontendEnv, 'utf8').includes('TRACELYT_API_KEY=')) {
      console.log('frontend/.env.local has no key. Revoke the old key in Postgres and run seed again to issue a new one.')
    }
  }
}

seed()
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
