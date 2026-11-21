import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { TracelytClient } from '../src/client'

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator)
    if (!process.env[key]) process.env[key] = trimmed.slice(separator + 1)
  }
}

loadEnv(path.join(__dirname, '../../frontend/.env.local'))

async function main() {
  const apiKey = process.env.TRACELYT_API_KEY
  if (!apiKey) {
    throw new Error('TRACELYT_API_KEY is missing. Run pnpm seed from the repository root.')
  }

  const client = new TracelytClient({
    endpoint: process.env.TRACELYT_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    apiKey,
    serviceName: 'eurocampings-graphql',
    flushIntervalMs: 0,
    flushSize: 20,
  })

  const samples: Array<[string, number, number]> = [
    ['SearchCampsites', 2800, 1],
    ['SearchCampsites', 420, 0],
    ['SearchCampsites', 350, 0],
    ['GetCampingDetails', 1200, 0],
    ['GetNavigation', 120, 0],
  ]

  for (const [operationName, durationMs, graphqlErrorCount] of samples) {
    client.record({
      operationName,
      operationType: 'query',
      durationMs,
      httpStatus: 200,
      graphqlErrorCount,
      networkError: false,
      errorMessage: graphqlErrorCount > 0 ? 'Availability timeout' : undefined,
    })
  }

  await client.flush()
  client.stop()
  console.log(`Sent ${samples.length} API events to ${process.env.TRACELYT_API_URL || 'http://localhost:4000'}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
