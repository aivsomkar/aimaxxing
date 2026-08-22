export async function loadPublicHomeData<S, E>(
  loadSummary: () => Promise<S>,
  loadEntrants: () => Promise<E>,
): Promise<{ summary: S; entrants: E }> {
  const [summary, entrants] = await Promise.all([loadSummary(), loadEntrants()])
  return { summary, entrants }
}
