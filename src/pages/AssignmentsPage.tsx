import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import App from '../App'
import { AssignmentRow } from '../components/AssignmentRow'
import { buildAssignment } from '../utils/assignmentModel'
import { fmtDate } from '../utils/time'
import type { Assignment } from '../utils/assignmentModel'

const LS_ASSIGNMENTS_KEY = 'aliveline:assignments'

type AssignmentDraftV2 = {
  assignments: (Assignment & { children?: Assignment[] })[]
}

function readDraft() {
  const saved = localStorage.getItem(LS_ASSIGNMENTS_KEY)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved) as AssignmentDraftV2
    if (!Array.isArray(parsed.assignments)) return null
    return parsed
  } catch {
    return null
  }
}

export function AssignmentsPage() {
  const navigate = useNavigate()
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const [hasListOverflow, setHasListOverflow] = useState(false)
  const draft = readDraft()
  const assignments = (draft?.assignments ?? []).map((assignment) => {
    if (
      assignment.title === 'New assignment' &&
      assignment.estimateMinutes === 60 &&
      assignment.id.startsWith('assignment-')
    ) {
      return { ...assignment, estimateMinutes: undefined }
    }
    return assignment
  })

  useEffect(() => {
    if (!draft) return
    const hadLegacyDefault = draft.assignments.some(
      (assignment) =>
        assignment.title === 'New assignment' &&
        assignment.estimateMinutes === 60 &&
        assignment.id.startsWith('assignment-')
    )
    if (!hadLegacyDefault) return
    localStorage.setItem(
      LS_ASSIGNMENTS_KEY,
      JSON.stringify({
        ...draft,
        assignments,
      } satisfies AssignmentDraftV2)
    )
  }, [assignments, draft])

  useEffect(() => {
    const element = listScrollRef.current
    if (!element) return

    const updateOverflow = () => {
      setHasListOverflow(element.scrollHeight > element.clientHeight)
    }

    updateOverflow()
    window.addEventListener('resize', updateOverflow)
    return () => window.removeEventListener('resize', updateOverflow)
  }, [assignments.length])
  const affectingAssignments = assignments

  const onAddAssignment = () => {
    const currentDraft = readDraft()
    const currentAssignments = currentDraft?.assignments ?? []
    const baseDeadlineIso = currentAssignments[0]?.deadlineIso ?? new Date().toISOString()

    const newIndex = 0
    const newAssignmentId = `assignment-${Date.now()}`
    const newAssignment = buildAssignment({
      id: newAssignmentId,
      title: 'New assignment',
      deadlineIso: baseDeadlineIso,
    })

    const nextAssignments = [
      { ...newAssignment, children: [] as Assignment[] },
      ...currentAssignments,
    ]

    localStorage.setItem(
      LS_ASSIGNMENTS_KEY,
      JSON.stringify({
        assignments: nextAssignments,
      } satisfies AssignmentDraftV2)
    )

    navigate(`/assignments/view/${newIndex}`)
  }

  return (
    <div className="app">
      <div className="assignmentPageLayout">
        <div className="assignmentPageBody">
          <div className="assignmentSection">
            <div className="assignmentSectionHeader">
              <div className="assignmentSectionTitle sectionHeading">Assignments</div>
              <button
                type="button"
                className="assignmentSectionAddButton"
                aria-label="Add assignment from list page"
                onClick={onAddAssignment}
              >
                <i className="las la-plus" aria-hidden="true"></i>
              </button>
            </div>
            <div
              ref={listScrollRef}
              className="assignmentListScroll"
              data-has-overflow={hasListOverflow ? 'true' : 'false'}
            >
              <div className="assignmentList">
                {affectingAssignments.map((assignment, index) => (
                  <AssignmentRow
                    key={assignment.id}
                    title={assignment.title}
                    meta={
                      <span className="assignmentDueText" aria-label="Assignment list due time display">
                        <span className="assignmentDueTime">{fmtDate(new Date(assignment.deadlineIso))}</span>
                      </span>
                    }
                    action={
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => navigate(`/assignments/view/${index}`)}
                      >
                        View
                      </button>
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          <App
            selectedAssignmentId={affectingAssignments[0]?.id}
            showTopNav={false}
            persistDraft={false}
            renderMessagesOnly={true}
          />
        </div>
      </div>
    </div>
  )
}
