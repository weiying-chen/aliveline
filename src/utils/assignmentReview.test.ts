import { describe, expect, it } from 'vitest'

import {
  getAssignmentAfterDeadlineChange,
  shouldConfirmKeepingAssignment,
} from './assignmentReview'

describe('shouldConfirmKeepingAssignment', () => {
  it('requires confirmation when the current assignment is not blank', () => {
    expect(shouldConfirmKeepingAssignment('Existing assignment')).toBe(true)
  })

  it('does not require confirmation when the assignment is blank', () => {
    expect(shouldConfirmKeepingAssignment('   ')).toBe(false)
  })
})

describe('getAssignmentAfterDeadlineChange', () => {
  it('keeps the current assignment when the user confirms it', () => {
    expect(getAssignmentAfterDeadlineChange('Existing assignment', true)).toBe(
      'Existing assignment'
    )
  })

  it('clears the assignment when the user does not keep it', () => {
    expect(getAssignmentAfterDeadlineChange('Existing assignment', false)).toBe('')
  })
})
