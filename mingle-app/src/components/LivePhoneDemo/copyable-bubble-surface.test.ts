import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CopyableBubbleSurface from './CopyableBubbleSurface'

describe('CopyableBubbleSurface', () => {
  it('disables native text selection and touch callouts while preserving layout styles', () => {
    const html = renderToStaticMarkup(
      createElement(
        CopyableBubbleSurface,
        {
          text: 'Hello world',
          copiedToastLabel: 'Copied',
          className: 'rounded-2xl border',
          style: { maxWidth: '85%' },
        },
        createElement('span', null, 'Hello world'),
      ),
    )

    expect(html).toContain('data-copyable-bubble')
    expect(html).toContain('select-none')
    expect(html).not.toContain('select-text')
    expect(html).toContain('max-width:85%')
    expect(html).toContain('-webkit-touch-callout:none')
    expect(html).toContain('-webkit-user-select:none')
    expect(html).toContain('user-select:none')
    expect(html).toContain('draggable="false"')
  })
})
