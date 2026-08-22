import { createReadStream } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AdapterWarning } from './types.js'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function findJsonlFiles(root: string): Promise<string[]> {
  if (!await pathExists(root)) return []
  const files: string[] = []
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path)
    }
  }
  await visit(root)
  return files.sort()
}

export async function readJsonLines(
  file: string,
  adapter: string,
  onRecord: (record: unknown) => void,
): Promise<{ recordsRead: number; warnings: AdapterWarning[] }> {
  let recordsRead = 0
  const warnings: AdapterWarning[] = []
  const lines = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of lines) {
    if (!line.trim()) continue
    recordsRead += 1
    try {
      onRecord(JSON.parse(line) as unknown)
    } catch (error) {
      if (error instanceof SyntaxError) {
        warnings.push({ adapter, code: 'invalid_json', message: 'Skipped an invalid JSON record.' })
      } else {
        throw error
      }
    }
  }
  return { recordsRead, warnings }
}

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function identifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function counter(value: unknown, fallback = 0): number | null {
  if (value === undefined || value === null) return fallback
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null
}

export function utcDay(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null
}
