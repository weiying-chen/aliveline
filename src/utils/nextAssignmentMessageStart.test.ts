import { describe, expect, it } from 'vitest'

import { syncNextAssignmentMessageStartWithDeadline } from './nextAssignmentMessageStart'

describe('syncNextAssignmentMessageStartWithDeadline', () => {
  it('always matches deadline date and time', () => {
    const deadline = new Date(2026, 2, 9, 18, 20)
    const currentStart = new Date(2026, 2, 3, 11, 40)

    const next = syncNextAssignmentMessageStartWithDeadline(currentStart, deadline)

    expect(next.getTime()).toBe(deadline.getTime())
  })

  it('falls back to deadline date and time when start is missing', () => {
    const deadline = new Date(2026, 2, 9, 18, 20)

    const next = syncNextAssignmentMessageStartWithDeadline(null, deadline)

    expect(next.getTime()).toBe(deadline.getTime())
  })
})
