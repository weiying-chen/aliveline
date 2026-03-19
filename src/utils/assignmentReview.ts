export function shouldConfirmKeepingAssignment(assignment: string) {
  return assignment.trim().length > 0
}

export function getAssignmentAfterDeadlineChange(assignment: string, keepSameAssignment: boolean) {
  return keepSameAssignment ? assignment : ''
}
