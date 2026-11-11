// Reads the string fields of a flat JSON object that is still being streamed,
// e.g. `{"translatedSource":"Hi.","ko":"안녕` → translatedSource (complete) and
// ko = "안녕" (still growing). Non-string values are skipped. Nested objects and
// arrays are not expected (translation answers are flat) and stop the read.

export type PartialJsonStrings = {
  /** Every string field seen so far, including the one still being written. */
  values: Record<string, string>
  /** Fields whose closing quote has arrived. */
  complete: Set<string>
}

const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
}

type StringRead = { value: string, end: number, closed: boolean }

/** Reads a JSON string starting after its opening quote. */
function readString(text: string, start: number): StringRead {
  let value = ''
  let index = start
  while (index < text.length) {
    const char = text[index] as string
    if (char === '"') return { value, end: index + 1, closed: true }
    if (char !== '\\') {
      value += char
      index += 1
      continue
    }
    const next = text[index + 1]
    if (next === undefined) break
    if (next === 'u') {
      const hex = text.slice(index + 2, index + 6)
      if (hex.length < 4) break
      const code = Number.parseInt(hex, 16)
      if (Number.isNaN(code)) break
      value += String.fromCharCode(code)
      index += 6
      continue
    }
    value += SIMPLE_ESCAPES[next] ?? next
    index += 2
  }
  // An unfinished surrogate pair would render as a broken glyph.
  if (/[\uD800-\uDBFF]$/.test(value)) value = value.slice(0, -1)
  return { value, end: text.length, closed: false }
}

function skipWhitespace(text: string, index: number): number {
  while (index < text.length && /\s/.test(text[index] as string)) index += 1
  return index
}

export function readPartialJsonStrings(content: string): PartialJsonStrings {
  const values: Record<string, string> = {}
  const complete = new Set<string>()
  const text = content || ''
  const brace = text.indexOf('{')
  if (brace < 0) return { values, complete }
  let index = brace + 1

  while (index < text.length) {
    index = skipWhitespace(text, index)
    if (text[index] === ',') index = skipWhitespace(text, index + 1)
    if (text[index] !== '"') break
    const key = readString(text, index + 1)
    if (!key.closed) break
    index = skipWhitespace(text, key.end)
    if (text[index] !== ':') break
    index = skipWhitespace(text, index + 1)
    if (index >= text.length) break
    if (text[index] === '"') {
      const value = readString(text, index + 1)
      values[key.value] = value.value
      if (!value.closed) break
      complete.add(key.value)
      index = value.end
      continue
    }
    // true / false / null / numbers: skip to the next separator.
    const nextSeparator = text.slice(index).search(/[,}]/)
    if (nextSeparator < 0) break
    index += nextSeparator
    if (text[index] === '}') break
  }
  return { values, complete }
}
