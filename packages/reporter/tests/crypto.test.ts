import { verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/canonical-report.json' with { type: 'json' }
import {
  canonicalReportBytes,
  createReporterIdentity,
  signReport,
  type UnsignedReporterReport,
} from '../src/crypto'

describe('reporter crypto', () => {
  it('matches the server canonical fixture and signs with Ed25519', () => {
    const report = fixture.report as UnsignedReporterReport
    expect(canonicalReportBytes(report).toString('utf8')).toBe(fixture.canonicalJson)
    const identity = createReporterIdentity()
    const signed = signReport(report, identity.privateKeyPem)
    expect(verify(
      null,
      canonicalReportBytes(report),
      identity.publicKeyPem,
      Buffer.from(signed.signature, 'base64'),
    )).toBe(true)
    expect(identity.machineId.length).toBeGreaterThanOrEqual(43)
  })
})
