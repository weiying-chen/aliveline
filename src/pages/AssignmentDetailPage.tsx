import { Navigate, useParams } from 'react-router-dom'

import App from '../App'
import type { Assignment } from '../utils/assignmentModel'

const LS_ASSIGNMENTS_KEY = 'aliveline:assignments'

type AssignmentsStateV2 = {
  assignments: (Assignment & { children?: Assignment[] })[]
}

function readStoredAssignments() {
  const saved = localStorage.getItem(LS_ASSIGNMENTS_KEY)
  if (!saved) return null as AssignmentsStateV2 | null
  try {
    const parsed = JSON.parse(saved) as AssignmentsStateV2
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

  const state = readStoredAssignments()
  const assignments = state?.assignments ?? []
  const selected = assignments[index]

  if (!selected) {
    return <Navigate to="/assignments" replace />
  }

  return <App selectedAssignmentId={selected.id} showTopNav={true} showMessagesSection={false} />
}
