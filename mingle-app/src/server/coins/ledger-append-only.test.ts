import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// docs/coin-iap-spec.md 11: ledger rows are never updated or deleted. No
// application code may contain a write to app_coin_ledger other than an insert.
const SRC_ROOT = join(__dirname, '..', '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('coin ledger is append-only', () => {
  const files = sourceFiles(SRC_ROOT).map(path => ({ path, text: readFileSync(path, 'utf8') }))

  it('never calls a mutating Prisma method on appCoinLedger', () => {
    const offenders = files.filter(file => /appCoinLedger\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/.test(file.text))
    expect(offenders.map(file => file.path)).toEqual([])
  })

  it('never updates or deletes app_coin_ledger in raw SQL', () => {
    const offenders = files.filter(file => /(UPDATE\s+"?app_coin_ledger|DELETE\s+FROM\s+"?app_coin_ledger|TRUNCATE[^;]*app_coin_ledger)/i.test(file.text))
    expect(offenders.map(file => file.path)).toEqual([])
  })

  it('inserts ledger rows from the ledger module only', () => {
    const writers = files.filter(file => /appCoinLedger\s*\.\s*(create|createMany)\b/.test(file.text))
    expect(writers.map(file => file.path.replace(SRC_ROOT, ''))).toEqual(['/server/coins/ledger.ts'])
  })
})
