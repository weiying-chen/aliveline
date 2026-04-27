import type { TaskEntry } from './deadlineHistory'

export type AssignmentHistoryEntry = {
  createdAtIso: string
  assignment: string
  deadlineIso: string
  confirmedBy: string
  nextAssignment: string
  nextAssignmentConfirmedBy: string
  scheduleView: 'original' | 'adjusted'
  source: 'deadline_extension_copy'
  tasks: TaskEntry[]
  totalMinutes: number
}
export type AssignmentHistoryRecord = AssignmentHistoryEntry

type AssignmentHistoryEntryBuildInput = {
  assignment: string
  deadline: Date
  confirmedBy: string
  nextAssignment?: string
  nextAssignmentConfirmedBy?: string
  scheduleView?: 'original' | 'adjusted'
  source?: 'deadline_extension_copy'
  tasks: TaskEntry[]
}
type AssignmentHistoryBuildInput = AssignmentHistoryEntryBuildInput

function sanitizeTasks(tasks: TaskEntry[]) {
  return tasks
    .map((task) => ({
      text: task.text.trim(),
      minutes: Math.round(task.minutes),
    }))
    .filter((task) => task.text.length > 0 && Number.isFinite(task.minutes) && task.minutes > 0)
}

function escapeCsvCell(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildAssignmentHistoryEntry(
  input: AssignmentHistoryEntryBuildInput,
  createdAt: Date = new Date()
): AssignmentHistoryEntry {
  const tasks = sanitizeTasks(input.tasks)
  const totalMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0)

  return {
    createdAtIso: createdAt.toISOString(),
    assignment: input.assignment.trim(),
    deadlineIso: input.deadline.toISOString(),
    confirmedBy: input.confirmedBy.trim(),
    nextAssignment: input.nextAssignment?.trim() ?? '',
    nextAssignmentConfirmedBy: input.nextAssignmentConfirmedBy?.trim() ?? '',
    scheduleView: input.scheduleView ?? 'original',
    source: input.source ?? 'deadline_extension_copy',
    tasks,
    totalMinutes,
  }
}
export function buildAssignmentHistoryRecord(
  input: AssignmentHistoryBuildInput,
  createdAt: Date = new Date()
) {
  return buildAssignmentHistoryEntry(input, createdAt)
}

export function filterAssignmentHistoryEntriesByMonth(
  entries: AssignmentHistoryEntry[],
  year: number,
  month: number
) {
  return entries.filter((entry) => {
    const deadline = new Date(entry.deadlineIso)
    if (Number.isNaN(deadline.getTime())) return false
    return deadline.getFullYear() === year && deadline.getMonth() + 1 === month
  })
}
export function filterAssignmentHistoryByMonth(
  records: AssignmentHistoryRecord[],
  year: number,
  month: number
) {
  return filterAssignmentHistoryEntriesByMonth(records, year, month)
}

export function sumAssignmentHistoryEntryMinutes(entries: AssignmentHistoryEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.totalMinutes, 0)
}
export function sumAssignmentHistoryMinutes(records: AssignmentHistoryRecord[]) {
  return sumAssignmentHistoryEntryMinutes(records)
}

export function exportAssignmentHistoryCsv(entries: AssignmentHistoryEntry[]) {
  const header = [
    'created_at',
    'assignment',
    'deadline',
    'confirmed_by',
    'next_assignment',
    'next_assignment_confirmed_by',
    'total_minutes',
    'total_hours',
    'schedule_view',
    'source',
    'tasks',
  ].join(',')

  const rows = entries.map((entry) => {
    const tasksText = entry.tasks
      .map((task) => `${task.text} (${task.minutes}m)`)
      .join('; ')
    const cells = [
      entry.createdAtIso,
      entry.assignment,
      entry.deadlineIso,
      entry.confirmedBy,
      entry.nextAssignment,
      entry.nextAssignmentConfirmedBy,
      String(entry.totalMinutes),
      (entry.totalMinutes / 60).toFixed(2),
      entry.scheduleView,
      entry.source,
      tasksText,
    ]
    return cells.map(escapeCsvCell).join(',')
  })

  return [header, ...rows].join('\n')
}

export function exportAssignmentHistoryJson(entries: AssignmentHistoryEntry[]) {
  return JSON.stringify(entries, null, 2)
}
