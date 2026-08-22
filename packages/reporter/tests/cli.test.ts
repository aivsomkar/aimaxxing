import { describe, expect, it, vi } from 'vitest'
import { runCli, type CliDependencies } from '../src/cli'
import type { ReporterConfig } from '../src/config'
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
  return { deps, output, config }
}

describe('reporter CLI', () => {
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
    expect(deps.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ handle: 'linked-builder' }))
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
