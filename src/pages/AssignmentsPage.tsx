import { useNavigate } from 'react-router-dom'

import { AssignmentRow } from '../components/AssignmentRow'
import { formatDuration } from '../utils/deadlineHistory'
import { fmtTime } from '../utils/time'
import type { Assignment } from '../utils/assignmentModel'

const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'

type AssignmentDraftV2 = {
  rootAssignmentId: string
  assignments: Assignment[]
}

function readAssignmentsFromDraft() {
  const saved = localStorage.getItem(LS_ASSIGNMENT_DRAFT_KEY)
  if (!saved) return [] as Assignment[]
  try {
    const parsed = JSON.parse(saved) as AssignmentDraftV2
    if (!Array.isArray(parsed.assignments)) return []
    return parsed.assignments
  } catch {
    return []
  }
}

export function AssignmentsPage() {
  const navigate = useNavigate()
  const assignments = readAssignmentsFromDraft()
  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const root = assignments.find((assignment) => assignment.id === 'legacy-root') ?? assignments[0]
  const affectingAssignments =
    root?.relations
      .filter((relation) => relation.type === 'extends')
      .map((relation) => byId.get(relation.assignmentId))
      .filter((assignment): assignment is Assignment => Boolean(assignment)) ?? []

  return (
    <div className="app">
      <div className="assignmentPageLayout">
        <div className="assignmentPageBody">
          <div className="assignmentSection">
            <h1 className="assignmentOverviewTitle">Assignments</h1>
            <div className="assignmentList">
              {affectingAssignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  title={assignment.title}
                  middle={
                    <span className="assignmentDueText" aria-label="Assignment list due time display">
                      <span className="assignmentDueTime">{fmtTime(new Date(assignment.deadlineIso))}</span>
                      <span aria-hidden="true"> • </span>
                      <span className="assignmentDueDuration">
                        {formatDuration(assignment.estimateMinutes ?? 0)}
                      </span>
                    </span>
                  }
                  action={
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => navigate(`/assignments/${assignment.id}`)}
                    >
                      View
                    </button>
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
