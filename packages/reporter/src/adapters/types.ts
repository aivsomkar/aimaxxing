export type ReporterTool = 'claude-code' | 'codex-cli' | 'opencode'

export type UsageAggregate = {
  tool: ReporterTool
  model: string
  day: string
  sessions: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
}

export type UsageObservation = Omit<UsageAggregate, 'sessions'> & {
  recordId: string
  sessionId: string
}

export type AdapterWarning = {
  adapter: string
  code: string
  message: string
}

export type ScanResult = {
  rows: UsageAggregate[]
  filesRead: number
  recordsRead: number
  warnings: AdapterWarning[]
}

export interface UsageAdapter {
  id: ReporterTool
  detect(): Promise<boolean>
  scan(): Promise<ScanResult>
}
