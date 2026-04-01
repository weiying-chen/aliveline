import { describe, expect, it } from 'vitest'

import { calculateTaskFinishTimes, formatTaskTimeWithDuration, minutesFromTimeParts } from './taskTime'

describe('minutesFromTimeParts', () => {
  it('returns null when both fields are empty', () => {
    expect(minutesFromTimeParts('', '')).toBeNull()
  })

  it('returns null for invalid values', () => {
    expect(minutesFromTimeParts('nope', '10')).toBeNull()
    expect(minutesFromTimeParts('1', 'nope')).toBeNull()
    expect(minutesFromTimeParts('-1', '0')).toBeNull()
  })

  it('handles minutes only', () => {
    expect(minutesFromTimeParts('', '30')).toBe(30)
  })

  it('handles hours only', () => {
    expect(minutesFromTimeParts('1', '')).toBe(60)
  })

  it('handles hours and minutes', () => {
    expect(minutesFromTimeParts('1', '30')).toBe(90)
  })

  it('handles decimal hours', () => {
    expect(minutesFromTimeParts('1.5', '')).toBe(90)
  })
})

describe('calculateTaskFinishTimes', () => {
  it('returns an empty list for no tasks', () => {
    const start = new Date(2025, 0, 2, 9, 0)
    expect(calculateTaskFinishTimes(start, [])).toEqual([])
  })

  it('calculates cumulative finish times during work hours', () => {
    const start = new Date(2025, 0, 2, 9, 0)
    const finishTimes = calculateTaskFinishTimes(start, [{ minutes: 30 }, { minutes: 45 }])
    expect(finishTimes.map((item) => item.getTime())).toEqual([
      new Date(2025, 0, 2, 9, 30).getTime(),
      new Date(2025, 0, 2, 10, 15).getTime(),
    ])
  })

  it('skips non-work windows like lunch break and after-hours', () => {
    const start = new Date(2025, 0, 2, 11, 30)
    const finishTimes = calculateTaskFinishTimes(start, [{ minutes: 60 }, { minutes: 180 }])
    expect(finishTimes.map((item) => item.getTime())).toEqual([
      new Date(2025, 0, 2, 13, 30).getTime(),
      new Date(2025, 0, 2, 16, 30).getTime(),
    ])
  })
})

describe('formatTaskTimeWithDuration', () => {
  it('combines finish time and duration for the right-side task label', () => {
    const finishAt = new Date(2025, 0, 2, 13, 38)
    expect(formatTaskTimeWithDuration(finishAt, 60)).toBe('Due 1:38 PM • 1h')
  })
})
