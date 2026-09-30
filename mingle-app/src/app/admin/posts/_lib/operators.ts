import type { OperatorPostPickerEntry } from '@/server/operator-posts/types'
import { languageLabel } from './copy'

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').trim()
}

/**
 * Operators matching `query` by name, @handle, language code or Korean
 * language name ("포르투갈" finds every Portuguese persona). Postable
 * accounts first, then the list order.
 */
export function filterOperators(
  operators: readonly OperatorPostPickerEntry[],
  query: string,
): OperatorPostPickerEntry[] {
  const needle = normalize(query).replace(/^@/, '')
  const matches = needle
    ? operators.filter((operator) =>
        [operator.name ?? '', operator.handle, operator.language ?? '', languageLabel(operator.language)].some(
          (field) => normalize(field).includes(needle),
        ),
      )
    : [...operators]
  const postable = (operator: OperatorPostPickerEntry) => operator.isActive && !operator.restricted
  return [...matches.filter(postable), ...matches.filter((operator) => !postable(operator))]
}
