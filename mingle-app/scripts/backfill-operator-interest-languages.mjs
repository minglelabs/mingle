#!/usr/bin/env node
/**
 * Sets 관심 언어 on operator accounts that have none, from the language
 * their posts learn (operatorInterestLanguageFields). Prints what it would
 * write with --dry-run.
 *
 *   railway run -- npx tsx scripts/backfill-operator-interest-languages.mjs [--dry-run]
 */
import { prisma } from '../src/lib/prisma'
import { operatorInterestLanguageFields } from '../src/server/operator-post-reserve/poster-profile'

const dryRun = process.argv.includes('--dry-run')

const operators = await prisma.user.findMany({
  where: { isOperator: true, isDeleted: false, interestLanguages: { isEmpty: true } },
  select: { id: true, handle: true, primaryLanguages: true },
})
let updated = 0
for (const operator of operators) {
  const native = operator.primaryLanguages[0]
  if (!native) continue
  const fields = operatorInterestLanguageFields(operator.id, native)
  if (fields.interestLanguages.length === 0) continue
  console.log(operator.handle, native, '->', fields.interestLanguages[0], fields.interestLanguageLevels[0])
  if (!dryRun) {
    await prisma.user.update({ where: { id: operator.id }, data: fields })
    updated += 1
  }
}
console.log(JSON.stringify({ operators: operators.length, updated, dryRun }))
await prisma.$disconnect()
