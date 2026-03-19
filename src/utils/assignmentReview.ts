export type AssignmentReviewEvent =
  | { type: 'deadlineChanged'; assignment: string }
  | { type: 'assignmentEdited' }
  | { type: 'assignmentConfirmed' }

export function reduceAssignmentReviewState(
  current: boolean,
  event: AssignmentReviewEvent
) {
  switch (event.type) {
    case 'deadlineChanged':
      return event.assignment.trim().length > 0
    case 'assignmentEdited':
      return false
    case 'assignmentConfirmed':
      return false
  }
}
