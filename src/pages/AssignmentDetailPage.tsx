import { Navigate, useParams } from 'react-router-dom'

import App from '../App'
import type { Assignment } from '../utils/assignmentModel'

const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'

type AssignmentDraftV2 = {
  rootAssignmentId?: string
  assignments: Assignment[]
}

function readDraft() {
  const saved = localStorage.getItem(LS_ASSIGNMENT_DRAFT_KEY)
  if (!saved) return null as AssignmentDraftV2 | null
  try {
    const parsed = JSON.parse(saved) as AssignmentDraftV2
    if (!Array.isArray(parsed.assignments)) return null
    return parsed
  } catch {
    return null
  }
}

export function AssignmentDetailPage() {
  const { itemIndex } = useParams()
  const index = Number(itemIndex)
  if (!Number.isInteger(index) || index < 0) {
    return <Navigate to="/assignments" replace />
  }

  const draft = readDraft()
  const assignments = draft?.assignments ?? []
  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const root =
    assignments.find((assignment) => assignment.id === draft?.rootAssignmentId) ??
    assignments.find((assignment) => assignment.id === 'legacy-root') ??
    assignments[0]
  const affectingAssignments =
    root?.relations
      .filter((relation) => relation.type === 'extends')
      .map((relation) => byId.get(relation.assignmentId))
      .filter((assignment): assignment is Assignment => Boolean(assignment)) ?? []
  const selected = affectingAssignments[index]

  if (!selected) {
    return <Navigate to="/assignments" replace />
  }

  return <App selectedAssignmentId={selected.id} showTopNav={true} showMessagesSection={false} />
}
