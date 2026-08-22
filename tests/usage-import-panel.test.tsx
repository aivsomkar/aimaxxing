import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UsageImportPanel } from '../src/components/UsageImportPanel'

describe('UsageImportPanel', () => {
  it('presents the one-command verified import as the primary usage path', () => {
    const html = renderToStaticMarkup(<UsageImportPanel />)
    expect(html).toContain('npx aimaxxing@latest import')
    expect(html).toContain('Copy command')
    expect(html).toContain('Codex CLI')
    expect(html).toContain('Claude Code')
    expect(html).toContain('OpenCode')
    expect(html).toContain('only daily aggregates')
  })
})
