import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReporterSettings } from '../src/components/ReporterSettings'

describe('ReporterSettings', () => {
  it('shows the copyable one-command import when no reporter is linked', () => {
    const html = renderToStaticMarkup(<ReporterSettings reporters={[]} />)
    expect(html).toContain('npx aimaxxing@latest import')
    expect(html).toContain('Copy command')
  })

  it('shows narrow device state, revoke, and separately confirmed deletion without keys', () => {
    const html = renderToStaticMarkup(<ReporterSettings reporters={[{
      id: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
      machineLabel: 'Omkar Mac', fingerprintPrefix: 'sha256:abcdef1234567890',
      linkedAt: new Date('2026-08-23T00:00:00Z'),
      lastSeenAt: new Date('2026-08-23T01:00:00Z'), revokedAt: null, usageCount: 3,
    }]} />)
    expect(html).toContain('Omkar Mac')
    expect(html).toContain('sha256:abcdef1234567890')
    expect(html).toContain('Last synced')
    expect(html).toContain('Revoke reporter')
    expect(html).toContain('Delete synced data')
    expect(html).toContain('fingerprint confirmation')
    expect(html).not.toContain('BEGIN PUBLIC KEY')
    expect(html).not.toContain('BEGIN PRIVATE KEY')
  })

  it('marks revoked devices and does not offer another revoke action', () => {
    const html = renderToStaticMarkup(<ReporterSettings reporters={[{
      id: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
      machineLabel: 'Old Mac', fingerprintPrefix: 'sha256:old1234567890123',
      linkedAt: new Date('2026-08-20T00:00:00Z'),
      lastSeenAt: null, revokedAt: new Date('2026-08-22T00:00:00Z'), usageCount: 0,
    }]} />)
    expect(html).toContain('Revoked')
    expect(html).not.toContain('Revoke reporter')
  })
})
