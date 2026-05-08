import { describe, expect, it } from 'vitest'

import {
  addWorkMinutes,
  isInWorkTime,
  nextWorkStart,
  shouldShowDeadlineExtensionReminder,
  shouldShowEarlyFinishReminder,
  workMsBetween,
} from './workTime'

function at(h: number, m: number) {
  return new Date(2025, 0, 2, h, m, 0, 0)
}

function atDate(y: number, monthIndex: number, day: number, h: number, m: number) {
  return new Date(y, monthIndex, day, h, m, 0, 0)
}

describe('work time schedule', () => {
  it('counts time across midday', () => {
    const start = at(11, 30)
    const end = at(13, 30)
    const ms = workMsBetween(start, end)
    expect(ms).toBe(60 * 60000)
  })

  it('counts only the remaining time in the day block', () => {
    const start = at(11, 30)
    const end = at(12, 30)
    const ms = workMsBetween(start, end)
    expect(ms).toBe(30 * 60000)
  })

  it('recognizes work time inside blocks', () => {
    expect(isInWorkTime(at(8, 15))).toBe(true)
    expect(isInWorkTime(at(9, 0))).toBe(true)
    expect(isInWorkTime(at(12, 30))).toBe(false)
    expect(isInWorkTime(at(16, 45))).toBe(true)
    expect(isInWorkTime(at(17, 0))).toBe(false)
  })

  it('treats weekends as non-working time', () => {
    const saturday = atDate(2025, 0, 4, 9, 0)
    const sunday = atDate(2025, 0, 5, 9, 0)
    expect(isInWorkTime(saturday)).toBe(false)
    expect(isInWorkTime(sunday)).toBe(false)
  })
})

describe('addWorkMinutes', () => {
  it('starts counting at the next work block when before hours', () => {
    const start = at(7, 0)
    const end = addWorkMinutes(start, 60)
    expect(end.getHours()).toBe(9)
    expect(end.getMinutes()).toBe(0)
  })

  it('rolls into the next day after 17:00', () => {
    const start = at(16, 30)
    const end = addWorkMinutes(start, 120)
    expect(end.getDate()).toBe(3)
    expect(end.getHours()).toBe(9)
    expect(end.getMinutes()).toBe(30)
  })

  it('skips weekends when adding work minutes', () => {
    const start = atDate(2025, 0, 3, 16, 30)
    const end = addWorkMinutes(start, 120)
    expect(end.getDay()).toBe(1)
    expect(end.getHours()).toBe(9)
    expect(end.getMinutes()).toBe(30)
  })
})

describe('nextWorkStart', () => {
  it('returns the next work block start after hours', () => {
    const start = at(18, 0)
    const next = nextWorkStart(start)
    expect(next.getDate()).toBe(3)
    expect(next.getHours()).toBe(8)
    expect(next.getMinutes()).toBe(0)
  })

  it('skips weekends for the next work start', () => {
    const start = atDate(2025, 0, 3, 18, 0)
    const next = nextWorkStart(start)
    expect(next.getDay()).toBe(1)
    expect(next.getHours()).toBe(8)
    expect(next.getMinutes()).toBe(0)
  })

  it('returns now during work time', () => {
    const start = at(10, 15)
    const next = nextWorkStart(start)
    expect(next.getHours()).toBe(10)
    expect(next.getMinutes()).toBe(15)
  })
})

describe('shouldShowEarlyFinishReminder', () => {
  it('shows between 8:00 and 9:00 when deadline ends by 17:00', () => {
    const now = at(8, 5)
    const deadline = at(17, 0)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(true)
  })

  it('does not show before 8:00', () => {
    const now = at(7, 55)
    const deadline = at(17, 0)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(false)
  })

  it('does not show after 9:00', () => {
    const now = at(9, 1)
    const deadline = at(17, 0)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(false)
  })

  it('does not show when deadline is after 17:00', () => {
    const now = at(8, 10)
    const deadline = at(17, 15)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(false)
  })

  it('shows when deadline is exactly 17:00', () => {
    const now = at(8, 10)
    const deadline = at(17, 0)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(true)
  })

  it('does not show when a next-day deadline is at or after 9:00', () => {
    const now = at(8, 10)
    const deadline = at(9, 0)
    deadline.setDate(deadline.getDate() + 1)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(false)
  })

  it('shows the previous day between 8:00 and 9:00 when next-day deadline is before 9:00', () => {
    const now = at(8, 10)
    const deadline = at(8, 15)
    deadline.setDate(deadline.getDate() + 1)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(true)
  })

  it('shows on Friday for a Monday deadline before 9:00', () => {
    const now = atDate(2025, 0, 3, 8, 10) // Friday
    const deadline = atDate(2025, 0, 6, 8, 9) // Monday
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(true)
  })

  it('does not show on weekends', () => {
    const now = atDate(2025, 0, 4, 8, 10)
    const deadline = atDate(2025, 0, 4, 17, 0)
    expect(shouldShowEarlyFinishReminder(now, deadline)).toBe(false)
  })
})

describe('shouldShowDeadlineExtensionReminder', () => {
  it('does not show when there are no pending extension assignments', () => {
    const now = at(16, 2)
    const deadline = at(18, 0)
    expect(shouldShowDeadlineExtensionReminder(now, deadline, false)).toBe(false)
  })

  it('does not show at 4:00 when the same-day deadline spills past 17:00', () => {
    const now = at(16, 2)
    const deadline = at(18, 0)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(false)
  })

  it('shows at 4:00 when the deadline is exactly 17:00', () => {
    const now = at(16, 5)
    const deadline = at(17, 0)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(true)
  })

  it('shows one hour before a next-day deadline on the deadline day', () => {
    const now = atDate(2025, 0, 3, 8, 35)
    const deadline = atDate(2025, 0, 3, 9, 35)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(true)
  })

  it('shows at 4:00 PM for a next-day deadline', () => {
    const now = at(16, 3)
    const deadline = at(9, 35)
    deadline.setDate(deadline.getDate() + 1)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(true)
  })

  it('shows at 4:00 PM on Friday for a Monday deadline', () => {
    const now = atDate(2025, 0, 3, 16, 3) // Friday
    const deadline = atDate(2025, 0, 6, 9, 35) // Monday
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(true)
  })

  it('shows one hour before a same-day deadline ending by 17:00', () => {
    const now = at(15, 10)
    const deadline = at(16, 5)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(true)
  })

  it('does not show outside the reminder window', () => {
    const now = at(14, 30)
    const deadline = at(16, 5)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(false)
  })

  it('does not show after a same-day deadline passes', () => {
    const now = at(16, 6)
    const deadline = at(16, 5)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(false)
  })

  it('shows at 5:00 PM when a same-day deadline is at 6:00 PM', () => {
    const now = at(17, 1)
    const deadline = at(18, 0)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(true)
  })

  it('does not show after a next-day reminder window passes', () => {
    const now = atDate(2025, 0, 3, 9, 36)
    const deadline = atDate(2025, 0, 3, 9, 35)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(false)
  })

  it('does not show on weekends', () => {
    const now = atDate(2025, 0, 4, 16, 5)
    const deadline = atDate(2025, 0, 4, 17, 0)
    expect(shouldShowDeadlineExtensionReminder(now, deadline)).toBe(false)
  })
})

describe('workMsBetween', () => {
  it('skips weekend hours', () => {
    const start = atDate(2025, 0, 3, 16, 0)
    const end = atDate(2025, 0, 6, 9, 0)
    const ms = workMsBetween(start, end)
    expect(ms).toBe(2 * 60 * 60000)
  })
})
