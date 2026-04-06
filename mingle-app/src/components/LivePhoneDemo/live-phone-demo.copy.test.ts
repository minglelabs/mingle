import { describe, expect, it } from 'vitest'
import { COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME } from './live-phone-demo.copy'

describe('live-phone-demo.copy', () => {
  it('keeps the copied toast centered without using border styling', () => {
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).toContain('mx-auto')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).toContain('w-fit')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).toContain('bg-[#FFF4D8]')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).not.toContain('border')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).not.toContain('backdrop-blur')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).not.toContain('ring-')
    expect(COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME).toContain('shadow-[')
  })
})
