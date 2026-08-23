import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import fixture from '../packages/reporter/tests/fixtures/canonical-report.json' with { type: 'json' }
import {
  canonicalReportBytes,
  ReporterVerificationError,
  verifySignedReport,
  type UnsignedReporterReport,
} from '../src/lib/reporter-crypto'

const report: UnsignedReporterReport = {
  reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
  submissionId: 'submission-crypto-1',
  issuedAt: '2026-08-23T10:00:00.000Z',
  pricingVersion: '2026-08-23',
  rows: [{
    tool: 'codex-cli', model: 'gpt-5.2', day: '2026-08-23', sessions: 3,
    tokensIn: 100, tokensOut: 40, cacheRead: 20, cacheWrite: 10, costUsd: 1.2345,
  }],
}

function signed(overrides: Partial<UnsignedReporterReport> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const unsigned = { ...report, ...overrides }
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    value: {
      ...unsigned,
      signature: sign(null, canonicalReportBytes(unsigned), privateKey).toString('base64'),
    },
  }
}

describe('reporter signature verification', () => {
  it('matches the canonical bytes shipped with the CLI test fixture', () => {
    expect(canonicalReportBytes(fixture.report as UnsignedReporterReport).toString('utf8'))
      .toBe(fixture.canonicalJson)
  })

  it('uses a fixed canonical key order and verifies a valid Ed25519 report', () => {
    const first = canonicalReportBytes(report).toString('utf8')
    const reordered = canonicalReportBytes({
      rows: report.rows, pricingVersion: report.pricingVersion, issuedAt: report.issuedAt,
      submissionId: report.submissionId, reporterId: report.reporterId,
    }).toString('utf8')
    expect(first).toBe(reordered)
    expect(first.indexOf('reporterId')).toBeLessThan(first.indexOf('submissionId'))
    expect(first.indexOf('sessions')).toBeLessThan(first.indexOf('tokensIn'))

    const valid = signed()
    expect(verifySignedReport(valid.value, valid.publicKey, new Date('2026-08-23T10:04:59Z')))
      .toMatchObject({ reporterId: report.reporterId, submissionId: report.submissionId })
  })

  it('rejects altered payloads, malformed base64, non-Ed25519 keys, and stale timestamps', () => {
    const valid = signed()
    expect(() => verifySignedReport(
      { ...valid.value, pricingVersion: 'altered' }, valid.publicKey,
      new Date('2026-08-23T10:00:00Z'),
    )).toThrowError(ReporterVerificationError)
    expect(() => verifySignedReport(
      { ...valid.value, signature: 'not base64!' }, valid.publicKey,
      new Date('2026-08-23T10:00:00Z'),
    )).toThrowError(/signature/i)

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
      .export({ type: 'spki', format: 'pem' }).toString()
    expect(() => verifySignedReport(valid.value, rsa, new Date('2026-08-23T10:00:00Z')))
      .toThrowError(/Ed25519/i)
    expect(() => verifySignedReport(valid.value, valid.publicKey, new Date('2026-08-23T10:05:01Z')))
      .toThrowError(/timestamp/i)
  })

  it('rejects rows dated further than one day ahead of UTC today', () => {
    const future = signed({ rows: [{ ...report.rows[0], day: '2099-01-01' }] })
    expect(() => verifySignedReport(future.value, future.publicKey, new Date(report.issuedAt)))
      .toThrowError(ReporterVerificationError)
  })
})
