import { createHash, randomBytes } from 'node:crypto'

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `tl_${randomBytes(24).toString('base64url')}`
  return {
    raw,
    prefix: raw.slice(0, 12),
    hash: hashApiKey(raw),
  }
}
