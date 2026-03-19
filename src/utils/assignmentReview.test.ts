import { describe, expect, it } from 'vitest'

import { getAssignmentAfterDeadlineChange } from './assignmentReview'

describe('getAssignmentAfterDeadlineChange', () => {
  it('clears the assignment after a deadline change', () => {
    expect(getAssignmentAfterDeadlineChange('Existing assignment')).toBe('')
  })

  it('still returns an empty string when the assignment is already blank', () => {
    expect(getAssignmentAfterDeadlineChange('   ')).toBe('')
  })
})
