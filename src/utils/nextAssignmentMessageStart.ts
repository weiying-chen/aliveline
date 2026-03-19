export function syncNextAssignmentMessageStartWithDeadline(
  _currentStart: Date | null,
  deadline: Date
) {
  return new Date(deadline)
}
