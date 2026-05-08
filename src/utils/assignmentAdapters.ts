import { buildAssignment, type Assignment } from './assignmentModel'
import type { AssignmentEntry } from './deadlineHistory'

export type LegacyAssignmentState = {
  assignmentTitle: string
  deadline: string
  assignments: AssignmentEntry[]
}

const LEGACY_ROOT_ID = 'legacy-root'

function sanitizeLegacyAssignments(assignments: AssignmentEntry[]) {
  return assignments
    .map((item) => ({ text: item.text.trim(), minutes: Math.round(item.minutes) }))
    .filter((item) => item.text.length > 0 && Number.isFinite(item.minutes) && item.minutes > 0)
}

export function fromLegacyAssignmentState(state: LegacyAssignmentState): Assignment[] {
  const sanitizedAssignments = sanitizeLegacyAssignments(state.assignments)
  const childAssignments = sanitizedAssignments.map((item, index) =>
    buildAssignment({
      id: `legacy-item-${index}`,
      title: item.text,
      deadline: state.deadline,
      workMinutes: item.minutes,
    })
  )

  const root = buildAssignment({
    id: LEGACY_ROOT_ID,
    title: state.assignmentTitle,
    deadline: state.deadline,
    relations: childAssignments.map((item) => ({ assignmentId: item.id, type: 'extends' })),
  })

  return [root, ...childAssignments]
}

export function toLegacyAssignmentState(assignments: Assignment[], rootId?: string): LegacyAssignmentState {
  const root =
    assignments.find((assignment) => assignment.id === rootId) ??
    assignments[0] ??
    buildAssignment({ id: LEGACY_ROOT_ID, title: '', deadline: new Date(0).toISOString() })

  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]))

  const childAssignments = root.relations
    .filter((relation) => relation.type === 'extends')
    .map((relation) => byId.get(relation.assignmentId))
    .filter((assignment): assignment is Assignment => Boolean(assignment))
    .map((assignment) => ({
      text: assignment.title,
      minutes: assignment.workMinutes ?? 0,
    }))
    .filter((item) => item.text.trim().length > 0 && item.minutes > 0)

  return {
    assignmentTitle: root.title,
    deadline: root.deadline,
    assignments: childAssignments,
  }
}
