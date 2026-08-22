import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReporterApproval } from '../src/components/ReporterApproval'

describe('ReporterApproval', () => {
  it('shows safe device identity and approve/deny controls without key material', () => {
    const html = renderToStaticMarkup(<ReporterApproval link={{
      userCode: 'ABCD-EFGH',
      machineLabel: 'Omkar MacBook',
      fingerprintPrefix: 'sha256:abcd1234',
      expiresAt: new Date('2026-08-23T00:10:00Z'),
    }} />)
    expect(html).toContain('ABCD-EFGH')
    expect(html).toContain('Omkar MacBook')
    expect(html).toContain('sha256:abcd1234')
    expect(html).toContain('Approve device')
    expect(html).toContain('Deny')
    expect(html).not.toContain('BEGIN PUBLIC KEY')
    expect(html).not.toContain('deviceCode')
  })
})
