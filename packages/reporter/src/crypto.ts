import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import type { UsageAggregate } from './adapters/types.js'

export type UnsignedReporterReport = {
  reporterId: string
  submissionId: string
  issuedAt: string
  pricingVersion: string
  rows: UsageAggregate[]
}

export type SignedReporterReport = UnsignedReporterReport & { signature: string }

export type ReporterAction = {
  reporterId: string
  action: 'revoke'
  issuedAt: string
  requestId: string
  deleteData: boolean
}

export type SignedReporterAction = ReporterAction & { signature: string }

export function createReporterIdentity() {
  const pair = generateKeyPairSync('ed25519')
  return {
    machineId: randomBytes(32).toString('base64url'),
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

function canonicalRow(row: UsageAggregate) {
  return {
    tool: row.tool,
    model: row.model,
    day: row.day,
    sessions: row.sessions,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    cacheRead: row.cacheRead,
    cacheWrite: row.cacheWrite,
    costUsd: row.costUsd,
  }
}

export function canonicalReportBytes(report: UnsignedReporterReport): Buffer {
  return Buffer.from(JSON.stringify({
    reporterId: report.reporterId,
    submissionId: report.submissionId,
    issuedAt: report.issuedAt,
    pricingVersion: report.pricingVersion,
    rows: report.rows.map(canonicalRow),
  }), 'utf8')
}

export function canonicalActionBytes(action: ReporterAction): Buffer {
  return Buffer.from(JSON.stringify({
    reporterId: action.reporterId,
    action: action.action,
    issuedAt: action.issuedAt,
    requestId: action.requestId,
    deleteData: action.deleteData,
  }), 'utf8')
}

function signature(bytes: Buffer, privateKeyPem: string): string {
  return sign(null, bytes, privateKeyPem).toString('base64')
}

export function signReport(report: UnsignedReporterReport, privateKeyPem: string): SignedReporterReport {
  return { ...report, signature: signature(canonicalReportBytes(report), privateKeyPem) }
}

export function signAction(action: ReporterAction, privateKeyPem: string): SignedReporterAction {
  return { ...action, signature: signature(canonicalActionBytes(action), privateKeyPem) }
}
