const PASTE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** The image in a paste (a copied photo or screenshot), or null when it pastes text. */
export function pastedImage(data: Pick<DataTransfer, 'items'> | null): File | null {
  if (!data) return null
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && PASTE_IMAGE_TYPES.includes(item.type)) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
