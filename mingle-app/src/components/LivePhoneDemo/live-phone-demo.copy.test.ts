import { describe, expect, it } from 'vitest'
import { COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME } from './live-phone-demo.copy'

describe('live-phone-demo.copy', () => {
  it('keeps the copied toast centered within Sonner mobile containers', () => {
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).toContain('mx-auto')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).toContain('w-fit')
  })
})
