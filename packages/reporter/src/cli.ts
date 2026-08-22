#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { hostname } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import {
  deleteConfig,
  readConfig,
  redactedConfig,
  writeConfig,
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
import { createReporterHttp, type LinkStatusResponse, type ReporterHttp } from './http.js'
import { PRICING_VERSION } from './pricing.js'
import { scanUsage, type CompletedScan } from './scan.js'

type ReporterIdentity = ReturnType<typeof createReporterIdentity>

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
  machineLabel: hostname,
  apiBaseUrl: () => process.env.AIMAXXING_API_URL ?? 'http://localhost:3000',
  createIdentity: createReporterIdentity,
  signReport,
  signAction,
  loadConfig: () => readConfig(),
  saveConfig: (config) => writeConfig(config),
  removeConfig: () => deleteConfig(),
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
  output(`Total: ${total.sessions} session(s), ${total.tokens} tokens, $${total.cost.toFixed(4)} estimated spend.`)
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

async function link(args: string[], deps: CliDependencies): Promise<number> {
  const scanned = await deps.scanUsage()
  printScan(scanned, deps.stdout)
  if (!await permissionToTransmit(
    args, deps, 'Send only these daily aggregates and start linking this machine?',
  )) {
    deps.stdout('Link canceled; nothing was transmitted or stored.')
    return 1
  }

  const identity = deps.createIdentity()
  const apiBaseUrl = deps.apiBaseUrl().replace(/\/$/, '')
  const started = await deps.http.startLink(apiBaseUrl, {
    publicKey: identity.publicKeyPem,
    machineId: identity.machineId,
    machineLabel: deps.machineLabel(),
  })
  deps.stdout(`Verification code: ${started.userCode}`)
  deps.stdout(`Approve this machine: ${started.verificationUrl}`)
  await deps.openBrowser(started.verificationUrl)

  const interval = Math.max(1, Math.min(30, started.interval))
  let elapsed = 0
  let status: LinkStatusResponse = { status: 'pending' }
  while (elapsed < started.expiresIn) {
    await deps.sleep(interval * 1_000)
    elapsed += interval
    status = await deps.http.pollLink(apiBaseUrl, started.deviceCode)
    if (status.status !== 'pending' && status.status !== 'pending_approval_consumption') break
  }
  if (status.status !== 'approved') {
    deps.stderr(status.status === 'denied' ? 'Link was denied.' : 'Link expired before approval.')
    return 1
  }
  await deps.saveConfig({
    reporterId: status.reporterId,
    handle: status.handle,
    machineId: identity.machineId,
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem,
    apiBaseUrl,
    lastSyncAt: null,
  })
  deps.stdout(`Linked to @${status.handle}. Run \`aimaxxing sync\` to transmit usage.`)
  return 0
}

async function sync(args: string[], deps: CliDependencies): Promise<number> {
  const config = await deps.loadConfig()
  const scanned = await deps.scanUsage()
  printScan(scanned, deps.stdout)
  if (!await permissionToTransmit(args, deps, 'Send only these daily aggregates now?')) {
    deps.stdout('Sync canceled; nothing was transmitted.')
    return 1
  }
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
  deps.stdout(`Synced ${result.accepted} verified daily aggregate row(s).`)
  return 0
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
  output('Usage: aimaxxing <scan|link|sync|status|unlink> [--yes]')
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
    if (command === 'link') return link(args, deps)
    if (command === 'sync') return sync(args, deps)
    if (command === 'status') return status(deps)
    if (command === 'unlink') return unlink(deps)
    deps.stderr(`Unknown command: ${command}`)
    help(deps.stderr)
    return 1
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : 'Reporter failed unexpectedly.')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2))
}
