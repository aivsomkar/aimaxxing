import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deletePendingLink,
  readConfig,
  readPendingLink,
  redactedConfig,
  writeConfig,
  writePendingLink,
  type PendingReporterLink,
  type ReporterConfig,
} from '../src/config'

const config: ReporterConfig = {
  reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
  handle: 'builder',
  machineId: 'machine-secret',
  privateKeyPem: 'PRIVATE KEY SECRET',
  publicKeyPem: 'PUBLIC KEY MATERIAL',
  apiBaseUrl: 'https://example.test',
  lastSyncAt: null,
}

describe('reporter configuration', () => {
  it('persists resumable link identity privately and removes it after completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aimaxxing-pending-'))
    const path = join(root, 'pending-link.json')
    const pending: PendingReporterLink = {
      deviceCode: 'device-secret',
      userCode: 'ABCD-EFGH',
      verificationUrl: 'https://www.aimaxxing.lol/link?code=ABCD-EFGH',
      interval: 5,
      expiresAt: '2026-08-23T10:10:00.000Z',
      machineId: 'machine-secret',
      privateKeyPem: 'private-pem',
      publicKeyPem: 'public-pem',
      apiBaseUrl: 'https://www.aimaxxing.lol',
    }

    await writePendingLink(pending, path)
    expect(await readPendingLink(path)).toEqual(pending)
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600)
    await deletePendingLink(path)
    expect(await readPendingLink(path)).toBeNull()
  })

  it('writes atomically with private permissions and reads the validated result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aimaxxing-config-'))
    const path = join(root, 'nested', 'config.json')
    await writeConfig(config, path)
    expect(await readConfig(path)).toEqual(config)
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readFile(path, 'utf8')).not.toContain('.tmp-')
  })

  it('rejects corrupt config and never renders key or machine secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aimaxxing-corrupt-'))
    const path = join(root, 'config.json')
    await writeFile(path, '{bad json', 'utf8')
    await expect(readConfig(path)).rejects.toThrow(/corrupt/i)
    const rendered = JSON.stringify(redactedConfig(config))
    expect(rendered).not.toContain('PRIVATE KEY SECRET')
    expect(rendered).not.toContain('PUBLIC KEY MATERIAL')
    expect(rendered).not.toContain('machine-secret')
    expect(rendered).toContain('builder')
  })
})
