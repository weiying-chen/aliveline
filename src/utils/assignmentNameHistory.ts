import type { AssignmentEntry } from './deadlineHistory'

export function recentAssignmentNames(entries: AssignmentEntry[], limit = 6) {
  if (!Array.isArray(entries) || limit <= 0) return []
  const names: string[] = []
  const seen = new Set<string>()

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const raw = entries[i]?.text
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    names.push(trimmed)
    if (names.length >= limit) break
  }

  return names
}

export function updateRecentAssignmentNames(recent: string[], name: string, limit = 6) {
  if (!Array.isArray(recent) || limit <= 0) return []
  if (typeof name !== 'string') return recent.slice(0, limit)
  const trimmed = name.trim()
  if (!trimmed) return recent.slice(0, limit)

  const next = [trimmed, ...recent.filter((item) => item !== trimmed)]
  return next.slice(0, limit)
}
