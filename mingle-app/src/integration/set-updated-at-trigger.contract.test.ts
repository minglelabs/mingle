import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations')
const FUNCTION_DEFINITION = /CREATE OR REPLACE FUNCTION "?app"?\."?set_updated_at"?\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/g

// updated_at columns are TIMESTAMP WITHOUT TIME ZONE holding UTC. A bare CURRENT_TIMESTAMP/now()
// is converted to the session TimeZone on assignment, which skewed rows by +9h on an Asia/Seoul DB.
function latestSetUpdatedAtDefinition() {
  let latest: { migration: string; body: string } | null = null
  for (const migration of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    const file = path.join(MIGRATIONS_DIR, migration, 'migration.sql')
    if (!fs.existsSync(file)) continue
    for (const match of fs.readFileSync(file, 'utf8').matchAll(FUNCTION_DEFINITION)) {
      latest = { migration, body: match[0] }
    }
  }
  return latest
}

describe('app.set_updated_at trigger function', () => {
  it('writes updated_at as UTC regardless of the session TimeZone', () => {
    const latest = latestSetUpdatedAtDefinition()
    expect(latest).not.toBeNull()
    const assignment = latest!.body.match(/NEW\."?updated_at"?\s*(?::=|=)\s*([^;]+);/i)?.[1]?.trim()
    expect(assignment, latest!.migration).toMatch(/AT TIME ZONE 'UTC'|timezone\('UTC'/i)
  })
})
