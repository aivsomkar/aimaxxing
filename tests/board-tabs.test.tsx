import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BoardTabs, type BoardTab } from '../src/components/BoardTabs'
import type { BoardRow } from '../src/components/Board'

const row = (handle: string, value: number, display: string): BoardRow => ({
  handle, avatarUrl: null, value, verified: true, toolCount: 2, index: 10, display,
} as BoardRow)

const tabs: BoardTab[] = [
  { id: 'burn', title: '🔥 API Value', caption: 'Ranked by estimated API value.',
    entries: [row('omkar', 4453.67, '$4,453.67')] },
  { id: 'index', title: '🏆 The Index', caption: 'Sum of square roots.',
    entries: [row('milind', 39.7, '39.7')] },
]

describe('BoardTabs', () => {
  beforeAll(() => vi.stubGlobal('React', React))

  it('renders only the active board\'s rows, not every board at once', () => {
    const html = renderToStaticMarkup(<BoardTabs tabs={tabs} />)
    // Assert on ROW CONTENT, not the caption: the caption renders once either
    // way, so a version that stacked every Board would still pass a caption
    // check. Only the active board's entries may appear.
    expect(html).toContain('@omkar')
    expect(html).not.toContain('@milind')
    expect(html).toContain('Ranked by estimated API value.')
    expect(html).not.toContain('Sum of square roots.')
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1)
  })

  it('offers a tab for every board so none is unreachable', () => {
    const html = renderToStaticMarkup(<BoardTabs tabs={tabs} />)
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html).toContain('🔥 API Value')
    expect(html).toContain('🏆 The Index')
  })

  it('marks exactly one tab selected', () => {
    const html = renderToStaticMarkup(<BoardTabs tabs={tabs} />)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
  })

  it('renders nothing rather than crashing when there are no boards', () => {
    expect(renderToStaticMarkup(<BoardTabs tabs={[]} />)).toBe('')
  })
})
