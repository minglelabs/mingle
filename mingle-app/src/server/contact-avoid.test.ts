import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveContactAvoidCopy } from '@/i18n/contact-avoid-copy'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveOpenChatLabel } from '@/i18n/open-chat-label'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('hiding from people in the address book', () => {
  it('leaves both out of each other on the explore tab, unless that one person was let through', () => {
    const sql = read('src/server/contact-avoid.ts')
    // Whoever keeps the viewer's number, and whoever's number the viewer keeps.
    expect(sql).toContain('WHERE ca.owner_id = u.id AND ca.allowed = false')
    expect(sql).toContain('WHERE ca.owner_id = ${viewerId} AND ca.allowed = false AND ca.contact_hash = u.phone_hash')
    expect(read('src/server/people-discovery.ts')).toContain('${contactAvoidSql(viewerId)}')
  })

  it('keeps hashes only while hiding is on, and forgets them all when it is turned off', () => {
    const source = read('src/server/contact-avoid.ts')
    expect(source).toContain('if (user?.contactHideOff) return')
    expect(source).toContain('if (!enabled) await prisma.contactAvoid.deleteMany({ where: { ownerId: userId } })')
    // A sync keeps them: the match endpoint is where the numbers arrive.
    expect(read('src/server/contact-match.ts')).toContain('await rememberContactHashes(userId, hashes)')
  })

  it('has its switch and a per-friend chip on the contacts screen, in every app language', () => {
    const screen = read('src/components/contacts/contact-sync-screen.tsx')
    expect(screen).toContain('data-qa="contact-avoid-switch"')
    expect(screen).toContain('data-qa="contact-avoid-person"')
    const english = resolveContactAvoidCopy('en')
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveContactAvoidCopy(locale)
      for (const [key, text] of Object.entries(copy)) {
        expect(text.length, `${locale}.${key}`).toBeGreaterThan(0)
        if (locale !== 'en') expect(text, `${locale}.${key}`).not.toBe(english[key as keyof typeof english])
      }
      expect(resolveOpenChatLabel(locale).length).toBeGreaterThan(0)
    }
  })
})
