import { describe, expect, it } from 'vitest'

import {
  applyMinutesDeltaWithCarry,
  calculateTaskFinishTimes,
  formatTaskTimeWithDuration,
  minutesFromTimeParts,
  normalizeTaskTimeParts,
  pickTaskBatchBase,
  pickTaskFinishStart,
  stepHoursText,
  stepMinutesText,
} from './taskTime'

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

  it('rounds to the nearest 10 minutes', () => {
    expect(minutesFromTimeParts('1', '6')).toBe(70)
    expect(minutesFromTimeParts('1', '4')).toBe(60)
  })

  it('handles decimal hours', () => {
    expect(minutesFromTimeParts('1.5', '')).toBe(90)
  })
})

describe('normalizeTaskTimeParts', () => {
  it('carries extra minutes into hours', () => {
    expect(normalizeTaskTimeParts('1', '75')).toEqual({ hoursText: '2', minutesText: '15' })
  })

  it('supports carry when hours field is empty', () => {
    expect(normalizeTaskTimeParts('', '120')).toEqual({ hoursText: '2', minutesText: '0' })
  })

  it('leaves minutes unchanged under 60', () => {
    expect(normalizeTaskTimeParts('1', '59')).toEqual({ hoursText: '1', minutesText: '59' })
  })

  it('borrows an hour when minutes go below 0', () => {
    expect(normalizeTaskTimeParts('2', '-1')).toEqual({ hoursText: '1', minutesText: '59' })
  })

  it('clamps to zero when borrowing would go below 0 total minutes', () => {
    expect(normalizeTaskTimeParts('0', '-1')).toEqual({ hoursText: '0', minutesText: '0' })
  })

  it('keeps raw carried minutes when typing over 60', () => {
    expect(normalizeTaskTimeParts('1', '66')).toEqual({ hoursText: '2', minutesText: '6' })
  })

  it('keeps raw minutes under 60 without snapping', () => {
    expect(normalizeTaskTimeParts('1', '56')).toEqual({ hoursText: '1', minutesText: '56' })
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

describe('pickTaskFinishStart', () => {
  it('uses the change base deadline when present so task due times stay fixed', () => {
    const deadline = new Date(2025, 0, 2, 14, 24)
    const changeBaseDeadline = new Date(2025, 0, 2, 8, 30)

    expect(pickTaskFinishStart(deadline, changeBaseDeadline).getTime()).toBe(
      changeBaseDeadline.getTime()
    )
  })

  it('falls back to the current deadline when there is no base', () => {
    const deadline = new Date(2025, 0, 2, 12, 30)

    expect(pickTaskFinishStart(deadline, null).getTime()).toBe(deadline.getTime())
  })
})

describe('pickTaskBatchBase', () => {
  it('uses now when starting a new task batch', () => {
    const now = new Date(2025, 0, 2, 10, 24)
    expect(pickTaskBatchBase(now, null).getTime()).toBe(now.getTime())
  })

  it('keeps the existing base while editing an active task batch', () => {
    const now = new Date(2025, 0, 2, 10, 24)
    const changeBaseDeadline = new Date(2025, 0, 2, 8, 30)
    expect(pickTaskBatchBase(now, changeBaseDeadline).getTime()).toBe(changeBaseDeadline.getTime())
  })
})

describe('formatTaskTimeWithDuration', () => {
  it('combines finish time and duration for the right-side task label', () => {
    const finishAt = new Date(2025, 0, 2, 13, 38)
    expect(formatTaskTimeWithDuration(finishAt, 60)).toBe('Due 1:38 PM • 1h')
  })
})

describe('stepMinutesText', () => {
  it('steps up by 10 from an arbitrary typed value', () => {
    expect(stepMinutesText('48', 10)).toBe('58')
  })

  it('steps down by 10 from an arbitrary typed value', () => {
    expect(stepMinutesText('48', -10)).toBe('38')
  })

  it('treats empty input as zero when stepping', () => {
    expect(stepMinutesText('', 10)).toBe('10')
  })
})

describe('applyMinutesDeltaWithCarry', () => {
  it('carries into hours when stepping minutes above 59', () => {
    expect(applyMinutesDeltaWithCarry('1', '58', 10)).toEqual({
      hoursText: '2',
      minutesText: '8',
    })
  })

  it('borrows from hours when stepping minutes below 0', () => {
    expect(applyMinutesDeltaWithCarry('2', '0', -10)).toEqual({
      hoursText: '1',
      minutesText: '50',
    })
  })
})

describe('stepHoursText', () => {
  it('steps up by 1 hour', () => {
    expect(stepHoursText('2', 1)).toBe('3')
  })

  it('clamps at 0 when stepping down', () => {
    expect(stepHoursText('0', -1)).toBe('0')
  })

  it('treats empty input as zero when stepping', () => {
    expect(stepHoursText('', 1)).toBe('1')
  })
})
