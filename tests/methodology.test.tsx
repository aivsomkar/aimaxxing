import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MethodologyContent } from '../src/components/MethodologyContent'
import {
  CONTRIBUTIONS_PER_UNIT,
  OUTPUT_CAP,
  QUALIFY_COST_USD,
  QUALIFY_SESSIONS,
} from '../src/lib/index-math'

describe('MethodologyContent', () => {
  it('documents the live qualification and output constants', () => {
    const html = renderToStaticMarkup(<MethodologyContent />)
    expect(html).toContain(String(QUALIFY_SESSIONS))
    expect(html).toContain(`$${QUALIFY_COST_USD}`)
    expect(html).toContain(String(OUTPUT_CAP))
    expect(html).toContain(String(CONTRIBUTIONS_PER_UNIT))
    expect(html).toContain('Self-reported')
    expect(html).toContain('Sponsored credits')
    expect(html).toContain('prompts')
  })
})
