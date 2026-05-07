import type { TaskEntry } from './deadlineHistory'
import { buildAssignment, type Assignment } from './assignmentModel'

export type AssignmentHistoryEntry = {
  createdAt: string
  deadline: string
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

export function buildAssignmentHistoryEntry(
  input: AssignmentHistoryEntryBuildInput,
  createdAt: Date = new Date()
): AssignmentHistoryEntry {
  const tasks = sanitizeTasks(input.tasks)
  const deadline = input.deadline.toISOString()
  const rootAssignmentId = 'root'
  const taskAssignments = tasks.map((task, index) =>
    buildAssignment({
      id: `task-${index}`,
      title: task.text,
      deadline,
      workMinutes: task.minutes,
    })
  )
  const root = buildAssignment({
    id: rootAssignmentId,
    title: input.assignment.trim(),
    deadline,
    relations: taskAssignments.map((task) => ({ assignmentId: task.id, type: 'extends' })),
  })

  return {
    createdAt: createdAt.toISOString(),
    deadline,
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
    const deadline = new Date(entry.deadline)
    if (Number.isNaN(deadline.getTime())) return false
    return deadline.getFullYear() === year && deadline.getMonth() + 1 === month
  })
}

export function sumAssignmentHistoryEntryMinutes(entries: AssignmentHistoryEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.totalMinutes, 0)
}

export function exportAssignmentHistoryJson(entries: AssignmentHistoryEntry[]) {
  return JSON.stringify(entries, null, 2)
}
