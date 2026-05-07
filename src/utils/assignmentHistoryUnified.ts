import type { AssignmentEntry } from './deadlineHistory'
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
  assignments: AssignmentEntry[]
}

function sanitizeAssignments(assignments: AssignmentEntry[]) {
  return assignments
    .map((item) => ({
      text: item.text.trim(),
      minutes: Math.round(item.minutes),
    }))
    .filter((item) => item.text.length > 0 && Number.isFinite(item.minutes) && item.minutes > 0)
}

export function buildAssignmentHistoryEntry(
  input: AssignmentHistoryEntryBuildInput,
  createdAt: Date = new Date()
): AssignmentHistoryEntry {
  const assignments = sanitizeAssignments(input.assignments)
  const deadline = input.deadline.toISOString()
  const rootAssignmentId = 'root'
  const taskAssignments = assignments.map((item, index) =>
    buildAssignment({
      id: `item-${index}`,
      title: item.text,
      deadline,
      workMinutes: item.minutes,
    })
  )
  const root = buildAssignment({
    id: rootAssignmentId,
    title: input.assignment.trim(),
    deadline,
    relations: taskAssignments.map((item) => ({ assignmentId: item.id, type: 'extends' })),
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
    totalMinutes: assignments.reduce((sum, item) => sum + item.minutes, 0),
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
