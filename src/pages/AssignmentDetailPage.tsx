import { Navigate, useParams } from 'react-router-dom'

import App from '../App'
import type { Assignment } from '../utils/assignmentModel'

const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'

type AssignmentDraftV2 = {
  assignments: (Assignment & { children?: Assignment[] })[]
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
  const selected = assignments[index]

  if (!selected) {
    return <Navigate to="/assignments" replace />
  }

  return <App selectedAssignmentId={selected.id} showTopNav={true} showMessagesSection={false} />
}
