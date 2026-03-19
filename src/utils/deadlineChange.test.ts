import { describe, expect, it } from 'vitest'

import { clearTextAfterDeadlineChange } from './deadlineChange'

describe('clearTextAfterDeadlineChange', () => {
  it('clears the current text after a deadline change', () => {
    expect(clearTextAfterDeadlineChange('Existing assignment')).toBe('')
  })

  it('still returns an empty string when the assignment is already blank', () => {
    expect(clearTextAfterDeadlineChange('   ')).toBe('')
  })
})
