// Every dollar figure on the site routes through this so amounts never disagree
// on thousands separators / decimal places between components or pages.
export function formatUsd(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
