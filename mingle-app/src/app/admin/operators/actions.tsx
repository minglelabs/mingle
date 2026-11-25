'use server'

import { requireAdmin } from '@/server/admin/guard'
import { listOperatorAccounts, normalizeOperatorSearch, parseAccountListScope } from '@/server/operators/operator-admin-query'
import { AccountItems, listHref } from './account-items'

/** The next page of the accounts tab, rendered on the server, for the list to append. */
export async function loadMoreAccounts(rawQuery: string, rawScope: string, page: number) {
  await requireAdmin('/admin/operators')
  const query = normalizeOperatorSearch(rawQuery)
  const scope = parseAccountListScope(rawScope)
  const list = await listOperatorAccounts({ query, page, scope })
  return {
    node: <AccountItems items={list.items} back={listHref(list.query, list.page, scope)} />,
    nextCursor: list.page < list.pageCount ? String(list.page + 1) : null,
  }
}
