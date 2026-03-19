import { describe, expect, it } from 'vitest'

import { reduceAssignmentReviewState } from './assignmentReview'

describe('reduceAssignmentReviewState', () => {
  it('requires confirmation after the deadline changes with an existing assignment', () => {
    expect(
      reduceAssignmentReviewState(false, {
        type: 'deadlineChanged',
        assignment: 'Existing assignment',
      })
    ).toBe(true)
  })

  it('does not require confirmation when the assignment is edited', () => {
    expect(reduceAssignmentReviewState(true, { type: 'assignmentEdited' })).toBe(false)
  })

  it('clears the confirmation requirement after the user keeps the same assignment', () => {
    expect(reduceAssignmentReviewState(true, { type: 'assignmentConfirmed' })).toBe(false)
  })
})
