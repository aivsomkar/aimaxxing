// Signing in is not consent to be listed, and having data is not consent either.
// Public listing requires an explicit, separate, revocable opt-in.
export function canAppearOnBoards(u: { publicOptIn: boolean; hasData: boolean }): boolean {
  return u.publicOptIn && u.hasData
}

export type ShowcaseSummary = {
  usageRows: number
  projects: number
  mergedPrs: number
  activeRepos: number
  contributions: number
}

export function hasShowcaseContent(summary: ShowcaseSummary): boolean {
  return summary.usageRows > 0
    || summary.projects > 0
    || summary.mergedPrs > 0
    || summary.activeRepos > 0
    || summary.contributions > 0
}
