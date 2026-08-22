import { createHash, createPublicKey, randomBytes } from 'node:crypto'
import {
  approveLinkSession,
  consumeApprovedLink,
  createLinkSession,
  denyLinkSession,
  findLinkSessionByUserCode,
  getLinkStatus,
  hashReporterSecret,
} from '@/lib/reporter-store'

type Database = Parameters<typeof createLinkSession>[0]

const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function userCode(): string {
  const bytes = randomBytes(8)
  const raw = [...bytes].map((byte) => USER_CODE_ALPHABET[byte & 31]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

function fingerprint(publicKey: string): string {
  return `sha256:${createHash('sha256').update(publicKey, 'utf8').digest('hex')}`
}

export function validReporterPublicKey(value: string): boolean {
  try {
    return createPublicKey(value).asymmetricKeyType === 'ed25519'
  } catch {
    return false
  }
}

export async function startReporterLink(
  database: Database,
  input: { publicKey: string; machineId: string; machineLabel: string },
  origin: string,
  now = new Date(),
) {
  if (!validReporterPublicKey(input.publicKey)) throw new Error('invalid reporter public key')
  const deviceCode = randomBytes(32).toString('base64url')
  const code = userCode()
  const expiresIn = 600
  await createLinkSession(database, {
    deviceCode,
    userCode: code,
    publicKey: input.publicKey,
    publicKeyFingerprint: fingerprint(input.publicKey),
    machineIdHash: hashReporterSecret(input.machineId),
    machineLabel: input.machineLabel,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
  })
  const verification = new URL('/link', origin)
  verification.searchParams.set('code', code)
  return {
    deviceCode,
    userCode: code,
    verificationUrl: verification.toString(),
    interval: 5,
    expiresIn,
  }
}

export async function pollReporterLink(database: Database, deviceCode: string, now = new Date()) {
  const status = await getLinkStatus(database, deviceCode, now)
  if (status.status !== 'pending_approval_consumption') return status
  const reporter = await consumeApprovedLink(database, deviceCode, now)
  if (!reporter) {
    const current = await getLinkStatus(database, deviceCode, now)
    return current.status === 'pending_approval_consumption'
      ? { status: 'denied' as const }
      : current
  }
  return getLinkStatus(database, deviceCode, now)
}

export async function getReporterApproval(database: Database, code: string, now = new Date()) {
  const link = await findLinkSessionByUserCode(database, code, now)
  if (!link) return null
  return {
    userCode: code,
    machineLabel: link.machineLabel,
    fingerprintPrefix: link.publicKeyFingerprint.slice(0, 23),
    expiresAt: link.expiresAt,
  }
}

export async function approveReporterLink(
  database: Database,
  code: string,
  userId: number,
  now = new Date(),
): Promise<boolean> {
  return Boolean(await approveLinkSession(database, code, userId, now))
}

export function denyReporterLink(
  database: Database,
  code: string,
  userId: number,
  now = new Date(),
): Promise<boolean> {
  return denyLinkSession(database, code, userId, now)
}
