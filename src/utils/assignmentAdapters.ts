import { buildAssignment, type Assignment } from './assignmentModel'
import type { TaskEntry } from './deadlineHistory'

export type LegacyAssignmentDraft = {
  assignmentTitle: string
  deadline: string
  tasks: TaskEntry[]
}

const LEGACY_ROOT_ID = 'legacy-root'

function sanitizeLegacyTasks(tasks: TaskEntry[]) {
  return tasks
    .map((task) => ({ text: task.text.trim(), minutes: Math.round(task.minutes) }))
    .filter((task) => task.text.length > 0 && Number.isFinite(task.minutes) && task.minutes > 0)
}

export function fromLegacyAssignmentDraft(draft: LegacyAssignmentDraft): Assignment[] {
  const sanitizedTasks = sanitizeLegacyTasks(draft.tasks)
  const taskAssignments = sanitizedTasks.map((task, index) =>
    buildAssignment({
      id: `legacy-task-${index}`,
      title: task.text,
      deadline: draft.deadline,
      workMinutes: task.minutes,
    })
  )

  const root = buildAssignment({
    id: LEGACY_ROOT_ID,
    title: draft.assignmentTitle,
    deadline: draft.deadline,
    relations: taskAssignments.map((task) => ({ assignmentId: task.id, type: 'extends' })),
  })

  return [root, ...taskAssignments]
}

export function toLegacyAssignmentDraft(assignments: Assignment[], rootId?: string): LegacyAssignmentDraft {
  const root =
    assignments.find((assignment) => assignment.id === rootId) ??
    assignments[0] ??
    buildAssignment({ id: LEGACY_ROOT_ID, title: '', deadline: new Date(0).toISOString() })

  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]))

  const tasks = root.relations
    .filter((relation) => relation.type === 'extends')
    .map((relation) => byId.get(relation.assignmentId))
    .filter((assignment): assignment is Assignment => Boolean(assignment))
    .map((assignment) => ({
      text: assignment.title,
      minutes: assignment.workMinutes ?? 0,
    }))
    .filter((task) => task.text.trim().length > 0 && task.minutes > 0)

  return {
    assignmentTitle: root.title,
    deadline: root.deadline,
    tasks,
  }
}
