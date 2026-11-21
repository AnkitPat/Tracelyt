import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateApiKey, hashApiKey } from './keys'

describe('api keys', () => {
  it('stores a hash instead of the raw key', () => {
    const generated = generateApiKey()
    assert.equal(generated.hash, hashApiKey(generated.raw))
    assert.notEqual(generated.hash, generated.raw)
    assert.equal(generated.raw.startsWith(generated.prefix), true)
    assert.equal(generated.prefix.length, 12)
  })
})
