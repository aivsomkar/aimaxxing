import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

export type ReporterConfig = {
  reporterId: string
  handle: string
  machineId: string
  privateKeyPem: string
  publicKeyPem: string
  apiBaseUrl: string
  lastSyncAt: string | null
}

export type PendingReporterLink = {
  deviceCode: string
  userCode: string
  verificationUrl: string
  interval: number
  expiresAt: string
  machineId: string
  privateKeyPem: string
  publicKeyPem: string
  apiBaseUrl: string
}

export class ReporterConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReporterConfigError'
  }
}

export function defaultConfigPath(): string {
  const override = process.env.AIMAXXING_CONFIG_DIR
  if (override) return join(override, 'config.json')
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'aimaxxing', 'config.json')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'aimaxxing', 'config.json')
}

export function defaultPendingLinkPath(): string {
  return join(dirname(defaultConfigPath()), 'pending-link.json')
}

function validConfig(value: unknown): value is ReporterConfig {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.reporterId === 'string'
    && typeof row.handle === 'string'
    && typeof row.machineId === 'string'
    && typeof row.privateKeyPem === 'string'
    && typeof row.publicKeyPem === 'string'
    && typeof row.apiBaseUrl === 'string'
    && (row.lastSyncAt === null || typeof row.lastSyncAt === 'string')
}

function validPendingLink(value: unknown): value is PendingReporterLink {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.deviceCode === 'string'
    && typeof row.userCode === 'string'
    && typeof row.verificationUrl === 'string'
    && typeof row.interval === 'number'
    && Number.isFinite(row.interval)
    && row.interval > 0
    && typeof row.expiresAt === 'string'
    && Number.isFinite(Date.parse(row.expiresAt))
    && typeof row.machineId === 'string'
    && typeof row.privateKeyPem === 'string'
    && typeof row.publicKeyPem === 'string'
    && typeof row.apiBaseUrl === 'string'
}

export async function readConfig(path = defaultConfigPath()): Promise<ReporterConfig> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!validConfig(value)) throw new Error('shape')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ReporterConfigError('Reporter is not linked. Run `npx aimaxxing@latest import` first.')
    }
    throw new ReporterConfigError('Reporter configuration is corrupt or unreadable.')
  }
}

export async function writeConfig(config: ReporterConfig, path = defaultConfigPath()): Promise<void> {
  if (!validConfig(config)) throw new ReporterConfigError('Refusing to write invalid reporter configuration.')
  await writePrivateJson(config, path)
}

async function writePrivateJson(value: unknown, path: string): Promise<void> {
  const folder = dirname(path)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    if (process.platform !== 'win32') await chmod(temporary, 0o600)
    await rename(temporary, path)
    if (process.platform !== 'win32') await chmod(path, 0o600)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function readPendingLink(
  path = defaultPendingLinkPath(),
): Promise<PendingReporterLink | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!validPendingLink(value)) throw new Error('shape')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new ReporterConfigError('Pending reporter link is corrupt or unreadable.')
  }
}

export async function writePendingLink(
  pending: PendingReporterLink,
  path = defaultPendingLinkPath(),
): Promise<void> {
  if (!validPendingLink(pending)) throw new ReporterConfigError('Refusing to write invalid pending link.')
  await writePrivateJson(pending, path)
}

export async function deletePendingLink(path = defaultPendingLinkPath()): Promise<void> {
  await rm(path, { force: true })
}

export async function deleteConfig(path = defaultConfigPath()): Promise<void> {
  await rm(path, { force: true })
}

export function redactedConfig(config: ReporterConfig) {
  return {
    reporterId: config.reporterId,
    handle: config.handle,
    apiBaseUrl: config.apiBaseUrl,
    lastSyncAt: config.lastSyncAt,
    identity: 'stored locally (redacted)',
  }
}
