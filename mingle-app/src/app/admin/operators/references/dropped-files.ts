/**
 * Every file in a drop, folders included (and their subfolders), for the
 * reference library's bulk upload. The entries must be taken during the drop
 * event itself; reading them can happen after.
 */
type Entry = FileSystemEntry & Partial<FileSystemFileEntry & FileSystemDirectoryEntry>

function readFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => entry.file(resolve, () => resolve(null)))
}

/** A directory reader hands entries out in chunks (about 100 at a time in Chrome): read until empty. */
async function readAllEntries(entry: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = entry.createReader()
  const all: Entry[] = []
  for (;;) {
    const chunk = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])))
    if (chunk.length === 0) return all
    all.push(...(chunk as Entry[]))
  }
}

async function walk(entry: Entry, out: File[], depth = 0): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await readFile(entry as FileSystemFileEntry)
    if (file) out.push(file)
    return
  }
  if (entry.isDirectory && depth < 8) {
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) await walk(child, out, depth + 1)
  }
}

export function takeDroppedEntries(data: DataTransfer): { entries: Entry[]; files: File[] } {
  const entries = Array.from(data.items ?? [])
    .map((item) => (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() as Entry | null : null))
    .filter((entry): entry is Entry => Boolean(entry))
  return { entries, files: Array.from(data.files ?? []) }
}

export async function filesFromDrop(taken: { entries: Entry[]; files: File[] }): Promise<File[]> {
  // No entry API (or nothing came through it): the plain file list.
  if (taken.entries.length === 0) return taken.files
  const out: File[] = []
  for (const entry of taken.entries) await walk(entry, out)
  // Sorted by name so a numbered folder (IMG_0001…) keeps its order.
  return out.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
}
