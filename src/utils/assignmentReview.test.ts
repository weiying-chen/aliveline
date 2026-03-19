import { describe, expect, it } from 'vitest'

import {
  getAssignmentAfterDeadlineChange,
  getStatusNextAssignmentAfterDeadlineChange,
} from './assignmentReview'

describe('getAssignmentAfterDeadlineChange', () => {
  it('clears the assignment after a deadline change', () => {
    expect(getAssignmentAfterDeadlineChange('Existing assignment')).toBe('')
  })

  it('still returns an empty string when the assignment is already blank', () => {
    expect(getAssignmentAfterDeadlineChange('   ')).toBe('')
  })
})

describe('getStatusNextAssignmentAfterDeadlineChange', () => {
  it('clears the next assignment after a deadline change', () => {
    expect(getStatusNextAssignmentAfterDeadlineChange('Next assignment')).toBe('')
  })

  it('still returns an empty string when the next assignment is already blank', () => {
    expect(getStatusNextAssignmentAfterDeadlineChange('   ')).toBe('')
  })
})
