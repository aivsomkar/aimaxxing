// Signing in is not consent to be listed, and having data is not consent either.
// Public listing requires an explicit, separate, revocable opt-in.
export function canAppearOnBoards(u: { publicOptIn: boolean; hasData: boolean }): boolean {
  return u.publicOptIn && u.hasData
}
