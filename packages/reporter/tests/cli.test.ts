import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  defaultApiBaseUrl,
  defaultMachineLabel,
  isMainModule,
  runCli,
  type CliDependencies,
} from '../src/cli'
import { ReporterHttpError } from '../src/http'
import {
  ReporterConfigError,
  type PendingReporterLink,
  type ReporterConfig,
} from '../src/config'
import type { CompletedScan } from '../src/scan'

const scan: CompletedScan = {
  rows: [{
    tool: 'codex-cli', model: 'gpt-5.2', day: '2026-08-23', sessions: 2,
    tokensIn: 10, tokensOut: 20, cacheRead: 30, cacheWrite: 40, costUsd: 1.5,
  }],
  filesRead: 2,
  recordsRead: 4,
  warnings: [],
}

function dependencies(overrides: Partial<CliDependencies> = {}) {
  const output: string[] = []
  const config: ReporterConfig = {
    reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3', handle: 'builder',
    machineId: 'machine-secret', privateKeyPem: 'private-pem', publicKeyPem: 'public-pem',
    apiBaseUrl: 'https://example.test', lastSyncAt: null,
  }
  const pending: PendingReporterLink = {
    deviceCode: 'pending-device',
    userCode: 'WXYZ-2345',
    verificationUrl: 'https://example.test/link?code=WXYZ-2345',
    interval: 1,
    expiresAt: '2026-08-23T10:10:00.000Z',
    machineId: 'pending-machine',
    privateKeyPem: 'pending-private',
    publicKeyPem: 'pending-public',
    apiBaseUrl: 'https://example.test',
  }
  const deps: CliDependencies = {
    scanUsage: vi.fn(async () => scan),
    confirm: vi.fn(async () => true),
    openBrowser: vi.fn(async () => undefined),
    sleep: vi.fn(async () => undefined),
    now: () => new Date('2026-08-23T10:00:00.000Z'),
    randomUUID: () => 'submission-test-1',
    machineLabel: () => 'Test machine',
    apiBaseUrl: () => 'https://example.test',
    createIdentity: () => ({
      machineId: 'new-machine', publicKeyPem: 'new-public', privateKeyPem: 'new-private',
    }),
    signReport: vi.fn((report) => ({ ...report, signature: 'signed-report' })),
    signAction: vi.fn((action) => ({ ...action, signature: 'signed-action' })),
    loadConfig: vi.fn(async () => config),
    saveConfig: vi.fn(async () => undefined),
    removeConfig: vi.fn(async () => undefined),
    loadPendingLink: vi.fn(async () => null),
    savePendingLink: vi.fn(async () => undefined),
    removePendingLink: vi.fn(async () => undefined),
    http: {
      startLink: vi.fn(async () => ({
        deviceCode: 'device', userCode: 'ABCD-EFGH',
        verificationUrl: 'https://example.test/link?code=ABCD-EFGH', interval: 1, expiresIn: 30,
      })),
      pollLink: vi.fn(async () => ({
        status: 'approved' as const, reporterId: config.reporterId, handle: config.handle,
      })),
      submitReport: vi.fn(async () => ({ ok: true as const, accepted: 1, submissionId: 'submission-test-1' })),
      revokeReporter: vi.fn(async () => ({ ok: true as const })),
    },
    stdout: (line) => output.push(line),
    stderr: (line) => output.push(line),
    ...overrides,
  }
  return { deps, output, config, pending }
}

describe('reporter CLI', () => {
  it('recognizes an npm bin symlink as the executable entrypoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aimaxxing-bin-'))
    const executable = join(root, 'dist', 'cli.js')
    const bin = join(root, 'aimaxxing')
    await mkdir(join(root, 'dist'))
    await writeFile(executable, '')
    await symlink(executable, bin)

    expect(isMainModule(pathToFileURL(executable).href, bin)).toBe(true)
  })

  it('uses the live AI Maxxing API by default while preserving an explicit override', () => {
    expect(defaultApiBaseUrl({})).toBe('https://www.aimaxxing.lol')
    expect(defaultApiBaseUrl({ AIMAXXING_API_URL: 'https://self-hosted.example/' }))
      .toBe('https://self-hosted.example')
  })

  it('uses a generic device label instead of transmitting the local hostname', () => {
    expect(defaultMachineLabel('darwin')).toBe('macOS reporter')
    expect(defaultMachineLabel('win32')).toBe('Windows reporter')
    expect(defaultMachineLabel('linux')).toBe('Linux reporter')
  })

  it('scan displays safe aggregates and makes zero network calls', async () => {
    const { deps, output } = dependencies()
    expect(await runCli(['scan'], deps)).toBe(0)
    expect(deps.http.startLink).not.toHaveBeenCalled()
    expect(deps.http.submitReport).not.toHaveBeenCalled()
    expect(output.join('\n')).toContain('gpt-5.2')
    expect(output.join('\n')).not.toContain('machine-secret')
  })

  it('a declined link scans first, makes no request, and stores nothing', async () => {
    const { deps } = dependencies({ confirm: vi.fn(async () => false) })
    expect(await runCli(['link'], deps)).toBe(1)
    expect(vi.mocked(deps.scanUsage).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(deps.confirm).mock.invocationCallOrder[0])
    expect(deps.http.startLink).not.toHaveBeenCalled()
    expect(deps.saveConfig).not.toHaveBeenCalled()
  })

  it('links after approval, polls at the server interval, and stores the handle', async () => {
    const { deps } = dependencies()
    const pending = { status: 'pending' as const }
    vi.mocked(deps.http.pollLink).mockResolvedValueOnce(pending).mockResolvedValueOnce({
      status: 'approved', reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3', handle: 'linked-builder',
    })
    expect(await runCli(['link'], deps)).toBe(0)
    expect(deps.sleep).toHaveBeenCalledWith(1_000)
    expect(deps.openBrowser).toHaveBeenCalled()
    expect(vi.mocked(deps.savePendingLink).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(deps.http.pollLink).mock.invocationCallOrder[0])
    expect(deps.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ handle: 'linked-builder' }))
    expect(deps.removePendingLink).toHaveBeenCalledOnce()
  })

  it('resumes an unexpired pending link without creating a second identity', async () => {
    const createIdentity = vi.fn(() => ({
      machineId: 'new-machine', publicKeyPem: 'new-public', privateKeyPem: 'new-private',
    }))
    const fixture = dependencies({ createIdentity })
    vi.mocked(fixture.deps.loadPendingLink).mockResolvedValue(fixture.pending)

    expect(await runCli(['link', '--yes'], fixture.deps)).toBe(0)

    expect(fixture.deps.http.startLink).not.toHaveBeenCalled()
    expect(createIdentity).not.toHaveBeenCalled()
    expect(fixture.deps.openBrowser).toHaveBeenCalledWith(fixture.pending.verificationUrl)
    expect(fixture.deps.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      machineId: 'pending-machine',
      privateKeyPem: 'pending-private',
    }))
    expect(fixture.deps.removePendingLink).toHaveBeenCalledOnce()
  })

  it('import links the machine and uploads the scanned aggregate in one command', async () => {
    const { deps, output } = dependencies({
      loadConfig: vi.fn(async () => {
        throw new ReporterConfigError('Reporter is not linked. Run import first.')
      }),
    })

    expect(await runCli(['import', '--yes'], deps)).toBe(0)

    expect(deps.openBrowser).toHaveBeenCalledWith('https://example.test/link?code=ABCD-EFGH')
    expect(deps.signReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
      submissionId: 'submission-test-1',
      rows: scan.rows,
    }), 'new-private')
    expect(deps.http.submitReport).toHaveBeenCalledWith(
      'https://example.test', expect.objectContaining({ signature: 'signed-report' }),
    )
    expect(deps.saveConfig).toHaveBeenLastCalledWith(expect.objectContaining({
      handle: 'builder',
      lastSyncAt: '2026-08-23T10:00:00.000Z',
    }))
    expect(output.join('\n')).toContain('Imported 1 verified daily aggregate row(s)')
  })

  it('import reuses an existing reporter instead of replacing its identity', async () => {
    const { deps, output } = dependencies()

    expect(await runCli(['import', '--yes'], deps)).toBe(0)

    expect(deps.http.startLink).not.toHaveBeenCalled()
    expect(deps.openBrowser).not.toHaveBeenCalled()
    expect(deps.signReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
      rows: scan.rows,
    }), 'private-pem')
    expect(output.join('\n')).toContain('Imported 1 verified daily aggregate row(s)')
  })

  it('import refuses to link when no supported usage was found', async () => {
    const { deps, output } = dependencies({
      scanUsage: vi.fn(async () => ({ ...scan, rows: [], filesRead: 0, recordsRead: 0 })),
    })

    expect(await runCli(['import'], deps)).toBe(1)
    expect(deps.http.startLink).not.toHaveBeenCalled()
    expect(deps.http.submitReport).not.toHaveBeenCalled()
    expect(output.join('\n')).toContain('No supported AI usage was found')
  })

  it('a resumed import still requires consent for the current aggregate', async () => {
    const fixture = dependencies({
      confirm: vi.fn(async () => false),
      loadConfig: vi.fn(async () => {
        throw new ReporterConfigError('Reporter is not linked. Run import first.')
      }),
    })
    vi.mocked(fixture.deps.loadPendingLink).mockResolvedValue(fixture.pending)

    expect(await runCli(['import'], fixture.deps)).toBe(1)

    expect(fixture.deps.http.pollLink).not.toHaveBeenCalled()
    expect(fixture.deps.http.submitReport).not.toHaveBeenCalled()
    expect(fixture.output.join('\n')).toContain('Import canceled')
  })

  it('--yes skips the transmission prompt and sync signs deterministic rows', async () => {
    const { deps } = dependencies()
    expect(await runCli(['sync', '--yes'], deps)).toBe(0)
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(deps.signReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
      submissionId: 'submission-test-1',
      rows: scan.rows,
    }), 'private-pem')
    expect(deps.http.submitReport).toHaveBeenCalledWith(
      'https://example.test', expect.objectContaining({ signature: 'signed-report' }),
    )
  })

  it('sync refuses an empty snapshot so it cannot erase previously synced usage', async () => {
    const { deps, output } = dependencies({
      scanUsage: vi.fn(async () => ({ ...scan, rows: [], filesRead: 0, recordsRead: 0 })),
    })

    expect(await runCli(['sync', '--yes'], deps)).toBe(1)
    expect(deps.http.submitReport).not.toHaveBeenCalled()
    expect(output.join('\n')).toContain('Empty snapshots are not uploaded')
  })

  it('keeps polling through a transient link-status failure', async () => {
    const { deps } = dependencies()
    vi.mocked(deps.http.pollLink)
      .mockRejectedValueOnce(new ReporterHttpError(0, 'temporary network error'))
      .mockResolvedValueOnce({
        status: 'approved', reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3', handle: 'builder',
      })

    expect(await runCli(['link', '--yes'], deps)).toBe(0)
    expect(deps.http.pollLink).toHaveBeenCalledTimes(2)
  })

  it('does not retry a permanent link-status rejection', async () => {
    const { deps, output } = dependencies()
    vi.mocked(deps.http.pollLink).mockRejectedValue(new ReporterHttpError(400, 'invalid request'))

    expect(await runCli(['link', '--yes'], deps)).toBe(1)
    expect(deps.http.pollLink).toHaveBeenCalledOnce()
    expect(output.join('\n')).toContain('invalid request')
  })

  it('status redacts secrets and unlink uses two confirmations before signed deletion', async () => {
    const { deps, output } = dependencies()
    expect(await runCli(['status'], deps)).toBe(0)
    expect(output.join('\n')).not.toContain('private-pem')
    expect(output.join('\n')).not.toContain('machine-secret')

    expect(await runCli(['unlink', '--yes'], deps)).toBe(0)
    expect(deps.confirm).toHaveBeenCalledTimes(2)
    expect(deps.signAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'revoke', deleteData: true,
    }), 'private-pem')
    expect(deps.http.revokeReporter).toHaveBeenCalled()
  })
})
