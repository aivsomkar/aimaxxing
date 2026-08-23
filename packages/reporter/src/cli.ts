#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { platform } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import {
  deleteConfig,
  deletePendingLink,
  readConfig,
  readPendingLink,
  redactedConfig,
  writeConfig,
  writePendingLink,
  ReporterConfigError,
  type PendingReporterLink,
  type ReporterConfig,
} from './config.js'
import {
  createReporterIdentity,
  signAction,
  signReport,
  type ReporterAction,
  type SignedReporterAction,
  type SignedReporterReport,
  type UnsignedReporterReport,
} from './crypto.js'
import {
  createReporterHttp,
  ReporterHttpError,
  type LinkStatusResponse,
  type ReporterHttp,
} from './http.js'
import { PRICING_VERSION } from './pricing.js'
import { scanUsage, type CompletedScan } from './scan.js'

type ReporterIdentity = ReturnType<typeof createReporterIdentity>

export function defaultApiBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.AIMAXXING_API_URL?.trim() || 'https://www.aimaxxing.lol').replace(/\/$/, '')
}

export function defaultMachineLabel(os: NodeJS.Platform = platform()): string {
  if (os === 'darwin') return 'macOS reporter'
  if (os === 'win32') return 'Windows reporter'
  if (os === 'linux') return 'Linux reporter'
  return 'AI usage reporter'
}

export function isMainModule(moduleUrl: string, executablePath: string): boolean {
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(executablePath)
  } catch {
    return false
  }
}

export type CliDependencies = {
  scanUsage: () => Promise<CompletedScan>
  confirm: (question: string) => Promise<boolean>
  openBrowser: (url: string) => Promise<void>
  sleep: (milliseconds: number) => Promise<void>
  now: () => Date
  randomUUID: () => string
  machineLabel: () => string
  apiBaseUrl: () => string
  createIdentity: () => ReporterIdentity
  signReport: (report: UnsignedReporterReport, privateKeyPem: string) => SignedReporterReport
  signAction: (action: ReporterAction, privateKeyPem: string) => SignedReporterAction
  loadConfig: () => Promise<ReporterConfig>
  saveConfig: (config: ReporterConfig) => Promise<void>
  removeConfig: () => Promise<void>
  loadPendingLink: () => Promise<PendingReporterLink | null>
  savePendingLink: (pending: PendingReporterLink) => Promise<void>
  removePendingLink: () => Promise<void>
  http: ReporterHttp
  stdout: (line: string) => void
  stderr: (line: string) => void
}

async function prompt(question: string): Promise<boolean> {
  const reader = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await reader.question(`${question} [y/N] `)
    return /^(y|yes)$/i.test(answer.trim())
  } finally {
    reader.close()
  }
}

async function openBrowser(url: string): Promise<void> {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]]
  await new Promise<void>((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', () => resolve())
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

const defaultDependencies: CliDependencies = {
  scanUsage,
  confirm: prompt,
  openBrowser,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => new Date(),
  randomUUID,
  machineLabel: () => defaultMachineLabel(),
  apiBaseUrl: () => defaultApiBaseUrl(),
  createIdentity: createReporterIdentity,
  signReport,
  signAction,
  loadConfig: () => readConfig(),
  saveConfig: (config) => writeConfig(config),
  removeConfig: () => deleteConfig(),
  loadPendingLink: () => readPendingLink(),
  savePendingLink: (pending) => writePendingLink(pending),
  removePendingLink: () => deletePendingLink(),
  http: createReporterHttp(),
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
}

function printScan(scan: CompletedScan, output: (line: string) => void) {
  const total = scan.rows.reduce((summary, row) => ({
    sessions: summary.sessions + row.sessions,
    tokens: summary.tokens + row.tokensIn + row.tokensOut + row.cacheRead + row.cacheWrite,
    cost: summary.cost + row.costUsd,
  }), { sessions: 0, tokens: 0, cost: 0 })
  output(`Scanned ${scan.filesRead} local usage file(s); ${scan.recordsRead} aggregate source record(s).`)
  for (const row of scan.rows) {
    const tokens = row.tokensIn + row.tokensOut + row.cacheRead + row.cacheWrite
    output(`${row.day}  ${row.tool}  ${row.model}  ${row.sessions} session(s)  ${tokens} tokens  $${row.costUsd.toFixed(4)}`)
  }
  output(`Total: ${total.sessions} session(s), ${total.tokens} tokens, $${total.cost.toFixed(4)} estimated API-equivalent value.`)
  for (const warning of scan.warnings) output(`Warning [${warning.adapter}/${warning.code}]: ${warning.message}`)
}

function hasYes(args: string[]) {
  return args.includes('--yes') || args.includes('-y')
}

async function permissionToTransmit(
  args: string[],
  deps: CliDependencies,
  message: string,
): Promise<boolean> {
  return hasYes(args) || deps.confirm(message)
}

async function connect(
  args: string[],
  deps: CliDependencies,
  currentAggregateApproved = false,
): Promise<ReporterConfig | null> {
  let pending = await deps.loadPendingLink()
  if (pending && Date.parse(pending.expiresAt) <= deps.now().getTime()) {
    await deps.removePendingLink()
    pending = null
  }

  if (!pending) {
    if (!currentAggregateApproved && !await permissionToTransmit(
      args, deps, 'Send only these daily aggregates and start linking this machine?',
    )) {
      deps.stdout('Link canceled; nothing was transmitted or stored.')
      return null
    }

    const identity = deps.createIdentity()
    const apiBaseUrl = deps.apiBaseUrl().replace(/\/$/, '')
    const started = await deps.http.startLink(apiBaseUrl, {
      publicKey: identity.publicKeyPem,
      machineId: identity.machineId,
      machineLabel: deps.machineLabel(),
    })
    pending = {
      deviceCode: started.deviceCode,
      userCode: started.userCode,
      verificationUrl: started.verificationUrl,
      interval: Math.max(1, Math.min(30, started.interval)),
      expiresAt: new Date(deps.now().getTime() + started.expiresIn * 1_000).toISOString(),
      machineId: identity.machineId,
      privateKeyPem: identity.privateKeyPem,
      publicKeyPem: identity.publicKeyPem,
      apiBaseUrl,
    }
    await deps.savePendingLink(pending)
  } else {
    deps.stdout('Resuming the pending browser approval for this machine.')
  }

  deps.stdout(`Verification code: ${pending.userCode}`)
  deps.stdout(`Approve this machine: ${pending.verificationUrl}`)
  await deps.openBrowser(pending.verificationUrl)

  const interval = pending.interval
  const expiresIn = Math.max(0, Math.ceil(
    (Date.parse(pending.expiresAt) - deps.now().getTime()) / 1_000,
  ))
  const expiresAt = Date.parse(pending.expiresAt)
  const maxAttempts = Math.max(1, Math.ceil(expiresIn / interval))
  let attempts = 0
  let status: LinkStatusResponse = { status: 'pending' }
  while (deps.now().getTime() < expiresAt && attempts < maxAttempts) {
    await deps.sleep(interval * 1_000)
    attempts += 1
    try {
      status = await deps.http.pollLink(pending.apiBaseUrl, pending.deviceCode)
    } catch (error) {
      const retryable = error instanceof ReporterHttpError
        && (error.status === 0 || error.status === 429 || error.status >= 500)
      if (!retryable) {
        await deps.removePendingLink()
        throw error
      }
      deps.stderr('Could not check approval yet; retrying until the link expires.')
      continue
    }
    if (status.status !== 'pending' && status.status !== 'pending_approval_consumption') break
  }
  if (status.status !== 'approved') {
    await deps.removePendingLink()
    deps.stderr(status.status === 'denied' ? 'Link was denied.' : 'Link expired before approval.')
    return null
  }
  const config: ReporterConfig = {
    reporterId: status.reporterId,
    handle: status.handle,
    machineId: pending.machineId,
    privateKeyPem: pending.privateKeyPem,
    publicKeyPem: pending.publicKeyPem,
    apiBaseUrl: pending.apiBaseUrl,
    lastSyncAt: null,
  }
  await deps.saveConfig(config)
  await deps.removePendingLink()
  return config
}

async function link(args: string[], deps: CliDependencies): Promise<number> {
  const scanned = await deps.scanUsage()
  printScan(scanned, deps.stdout)
  const config = await connect(args, deps)
  if (!config) return 1
  deps.stdout(`Linked to @${config.handle}. Run \`aimaxxing sync\` to transmit usage.`)
  return 0
}

async function uploadScan(
  config: ReporterConfig,
  scanned: CompletedScan,
  deps: CliDependencies,
  successVerb: 'Imported' | 'Synced',
): Promise<number> {
  const issuedAt = deps.now().toISOString()
  const report = deps.signReport({
    reporterId: config.reporterId,
    submissionId: deps.randomUUID(),
    issuedAt,
    pricingVersion: PRICING_VERSION,
    rows: scanned.rows,
  }, config.privateKeyPem)
  const result = await deps.http.submitReport(config.apiBaseUrl, report)
  await deps.saveConfig({ ...config, lastSyncAt: issuedAt })
  deps.stdout(`${successVerb} ${result.accepted} verified daily aggregate row(s) to @${config.handle}.`)
  return 0
}

async function importUsage(args: string[], deps: CliDependencies): Promise<number> {
  const scanned = await deps.scanUsage()
  printScan(scanned, deps.stdout)
  if (scanned.rows.length === 0) {
    deps.stderr('No supported AI usage was found. Nothing was linked or uploaded.')
    return 1
  }

  if (!await permissionToTransmit(args, deps, 'Import only these daily aggregates now?')) {
    deps.stdout('Import canceled; nothing was transmitted.')
    return 1
  }

  let existing: ReporterConfig | null = null
  try {
    existing = await deps.loadConfig()
  } catch (error) {
    if (!(error instanceof ReporterConfigError && error.message.startsWith('Reporter is not linked.'))) {
      throw error
    }
  }
  if (existing) {
    return uploadScan(existing, scanned, deps, 'Imported')
  }

  const config = await connect(args, deps, true)
  if (!config) return 1
  return uploadScan(config, scanned, deps, 'Imported')
}

async function sync(args: string[], deps: CliDependencies): Promise<number> {
  const config = await deps.loadConfig()
  const scanned = await deps.scanUsage()
  printScan(scanned, deps.stdout)
  if (scanned.rows.length === 0) {
    deps.stderr('No supported AI usage was found. Empty snapshots are not uploaded.')
    return 1
  }
  if (!await permissionToTransmit(args, deps, 'Send only these daily aggregates now?')) {
    deps.stdout('Sync canceled; nothing was transmitted.')
    return 1
  }
  return uploadScan(config, scanned, deps, 'Synced')
}

async function status(deps: CliDependencies): Promise<number> {
  deps.stdout(JSON.stringify(redactedConfig(await deps.loadConfig()), null, 2))
  return 0
}

async function unlink(deps: CliDependencies): Promise<number> {
  const config = await deps.loadConfig()
  if (!await deps.confirm(`Revoke this reporter from @${config.handle}?`)) {
    deps.stdout('Unlink canceled.')
    return 1
  }
  const deleteData = await deps.confirm('Also permanently delete usage synced by this reporter?')
  const action = deps.signAction({
    reporterId: config.reporterId,
    action: 'revoke',
    issuedAt: deps.now().toISOString(),
    requestId: deps.randomUUID(),
    deleteData,
  }, config.privateKeyPem)
  await deps.http.revokeReporter(config.apiBaseUrl, config.reporterId, action)
  await deps.removeConfig()
  deps.stdout(deleteData ? 'Reporter revoked and its synced usage deleted.' : 'Reporter revoked.')
  return 0
}

function help(output: (line: string) => void) {
  output('Usage: aimaxxing <import|scan|link|sync|status|unlink> [--yes]')
  output('import scans, links this machine in your browser, and uploads the approved aggregate.')
  output('scan never uses the network. --yes skips only the aggregate-transmission prompt.')
}

export async function runCli(args: string[], deps: CliDependencies = defaultDependencies): Promise<number> {
  try {
    const command = args.find((arg) => !arg.startsWith('-'))
    if (!command || command === 'help') { help(deps.stdout); return command ? 0 : 1 }
    if (command === 'scan') {
      printScan(await deps.scanUsage(), deps.stdout)
      return 0
    }
    if (command === 'import') return await importUsage(args, deps)
    if (command === 'link') return await link(args, deps)
    if (command === 'sync') return await sync(args, deps)
    if (command === 'status') return await status(deps)
    if (command === 'unlink') return await unlink(deps)
    deps.stderr(`Unknown command: ${command}`)
    help(deps.stderr)
    return 1
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : 'Reporter failed unexpectedly.')
    return 1
  }
}

if (process.argv[1] && isMainModule(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli(process.argv.slice(2))
}
