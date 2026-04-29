import type { TaskEntry } from './deadlineHistory'
import { buildAssignment, type Assignment } from './assignmentModel'

export type AssignmentHistoryEntry = {
  createdAtIso: string
  deadlineIso: string
  confirmedBy: string
  nextAssignment: string
  nextAssignmentConfirmedBy: string
  scheduleView: 'original' | 'adjusted'
  rootAssignmentId: string
  assignments: Assignment[]
  totalMinutes: number
}

type AssignmentHistoryEntryBuildInput = {
  assignment: string
  deadline: Date
  confirmedBy: string
  nextAssignment?: string
  nextAssignmentConfirmedBy?: string
  scheduleView?: 'original' | 'adjusted'
  tasks: TaskEntry[]
}

function sanitizeTasks(tasks: TaskEntry[]) {
  return tasks
    .map((task) => ({
      text: task.text.trim(),
      minutes: Math.round(task.minutes),
    }))
    .filter((task) => task.text.length > 0 && Number.isFinite(task.minutes) && task.minutes > 0)
}

function rootAndTasksFromEntry(entry: AssignmentHistoryEntry) {
  const byId = new Map(entry.assignments.map((item) => [item.id, item]))
  const root = byId.get(entry.rootAssignmentId)
  if (!root) return { rootTitle: '', tasks: [] as TaskEntry[] }

  const tasks = root.relations
    .filter((relation) => relation.type === 'extends')
    .map((relation) => byId.get(relation.assignmentId))
    .filter((item): item is Assignment => Boolean(item))
    .map((item) => ({ text: item.title, minutes: item.estimateMinutes ?? 0 }))
    .filter((task) => task.text.trim().length > 0 && task.minutes > 0)

  return {
    rootTitle: root.title,
    tasks,
  }
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
  const deadlineIso = input.deadline.toISOString()
  const rootAssignmentId = 'root'
  const taskAssignments = tasks.map((task, index) =>
    buildAssignment({
      id: `task-${index}`,
      title: task.text,
      deadlineIso,
      status: 'done',
      estimateMinutes: task.minutes,
    })
  )
  const root = buildAssignment({
    id: rootAssignmentId,
    title: input.assignment.trim(),
    deadlineIso,
    status: 'done',
    relations: taskAssignments.map((task) => ({ assignmentId: task.id, type: 'extends' })),
  })

  return {
    createdAtIso: createdAt.toISOString(),
    deadlineIso,
    confirmedBy: input.confirmedBy.trim(),
    nextAssignment: input.nextAssignment?.trim() ?? '',
    nextAssignmentConfirmedBy: input.nextAssignmentConfirmedBy?.trim() ?? '',
    scheduleView: input.scheduleView ?? 'original',
    rootAssignmentId,
    assignments: [root, ...taskAssignments],
    totalMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
  }
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

export function sumAssignmentHistoryEntryMinutes(entries: AssignmentHistoryEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.totalMinutes, 0)
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
    'tasks',
  ].join(',')

  const rows = entries.map((entry) => {
    const { rootTitle, tasks } = rootAndTasksFromEntry(entry)
    const tasksText = tasks.map((task) => `${task.text} (${task.minutes}m)`).join('; ')
    const cells = [
      entry.createdAtIso,
      rootTitle,
      entry.deadlineIso,
      entry.confirmedBy,
      entry.nextAssignment,
      entry.nextAssignmentConfirmedBy,
      String(entry.totalMinutes),
      (entry.totalMinutes / 60).toFixed(2),
      entry.scheduleView,
      tasksText,
    ]
    return cells.map(escapeCsvCell).join(',')
  })

  return [header, ...rows].join('\n')
}

export function exportAssignmentHistoryJson(entries: AssignmentHistoryEntry[]) {
  return JSON.stringify(entries, null, 2)
}
