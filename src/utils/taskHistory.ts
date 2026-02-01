import type { TaskEntry } from './deadlineHistory'

export function recentTaskNames(entries: TaskEntry[], limit = 6) {
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
