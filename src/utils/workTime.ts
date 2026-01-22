// Work-time rules: 8:00–12:00, 13:00–17:00 (local time).
// Pure logic: no React, no storage.

export type TimeHM = { h: number; m: number }
export type WorkBlock = { start: TimeHM; end: TimeHM }

export const WORK_BLOCKS: WorkBlock[] = [
  { start: { h: 8, m: 0 }, end: { h: 12, m: 0 } },
  { start: { h: 13, m: 0 }, end: { h: 17, m: 0 } },
]

function firstBlock(blocks: WorkBlock[]) {
  return blocks[0]
}

function lastBlock(blocks: WorkBlock[]) {
  return blocks[blocks.length - 1]
}

export function atLocalTime(baseDay: Date, t: TimeHM) {
  const d = new Date(baseDay)
  d.setHours(t.h, t.m, 0, 0)
  return d
}

export function isInWorkTime(now: Date, blocks: WorkBlock[] = WORK_BLOCKS) {
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  const t = now.getTime()

  for (const block of blocks) {
    const bs = atLocalTime(dayStart, block.start)
    const be = atLocalTime(dayStart, block.end)
    if (t >= bs.getTime() && t < be.getTime()) return true
  }

  return false
}

export function workMsBetween(start: Date, end: Date, blocks: WorkBlock[] = WORK_BLOCKS) {
  if (end.getTime() <= start.getTime()) return 0

  let total = 0

  const cursorDay = new Date(start)
  cursorDay.setHours(0, 0, 0, 0)

  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)

  for (let day = new Date(cursorDay); day.getTime() <= endDay.getTime(); day.setDate(day.getDate() + 1)) {
    for (const block of blocks) {
      const bs = atLocalTime(day, block.start)
      const be = atLocalTime(day, block.end)
      const startMs = Math.max(start.getTime(), bs.getTime())
      const endMs = Math.min(end.getTime(), be.getTime())
      total += Math.max(0, endMs - startMs)
    }
  }

  return total
}

export function nextWorkStart(now: Date, blocks: WorkBlock[] = WORK_BLOCKS) {
  if (isInWorkTime(now, blocks)) return now

  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  for (const block of blocks) {
    const bs = atLocalTime(dayStart, block.start)
    if (bs.getTime() > now.getTime()) return bs
  }

  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  return atLocalTime(nextDay, blocks[0].start)
}

export function addWorkMinutes(start: Date, minutes: number, blocks: WorkBlock[] = WORK_BLOCKS) {
  if (minutes <= 0) return new Date(start)

  let remainingMs = minutes * 60000
  let cursor = new Date(start)

  for (let safety = 0; safety < 366 * 3; safety++) {
    const dayStart = new Date(cursor)
    dayStart.setHours(0, 0, 0, 0)

    for (const block of blocks) {
      const bs = atLocalTime(dayStart, block.start)
      const be = atLocalTime(dayStart, block.end)

      if (cursor.getTime() > be.getTime()) continue

      const segmentStart = new Date(Math.max(cursor.getTime(), bs.getTime()))
      if (segmentStart.getTime() >= be.getTime()) continue

      const available = be.getTime() - segmentStart.getTime()
      if (remainingMs <= available) {
        return new Date(segmentStart.getTime() + remainingMs)
      }

      remainingMs -= available
      cursor = new Date(be)
    }

    cursor = new Date(dayStart)
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(0, 0, 0, 0)
  }

  return cursor
}

export function shouldShowEarlyFinishReminder(now: Date, deadline: Date) {
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  const deadlineDay = new Date(deadline)
  deadlineDay.setHours(0, 0, 0, 0)

  if (dayStart.getTime() !== deadlineDay.getTime()) return false

  const reminderStart = atLocalTime(dayStart, firstBlock(WORK_BLOCKS).start)
  const reminderEnd = new Date(reminderStart)
  reminderEnd.setMinutes(reminderEnd.getMinutes() + 30)

  const finishCutoff = atLocalTime(dayStart, lastBlock(WORK_BLOCKS).end)

  return (
    now.getTime() >= reminderStart.getTime() &&
    now.getTime() < reminderEnd.getTime() &&
    deadline.getTime() <= finishCutoff.getTime()
  )
}

export function shouldShowTeamsReminder(now: Date, deadline: Date) {
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  const deadlineDay = new Date(deadline)
  deadlineDay.setHours(0, 0, 0, 0)

  const dayCutoff = atLocalTime(dayStart, lastBlock(WORK_BLOCKS).end)

  if (deadlineDay.getTime() !== dayStart.getTime() || deadline.getTime() >= dayCutoff.getTime()) {
    const reminderEnd = new Date(dayCutoff)
    const reminderStart = new Date(dayCutoff)
    reminderStart.setMinutes(reminderStart.getMinutes() - 30)
    return now.getTime() >= reminderStart.getTime() && now.getTime() < reminderEnd.getTime()
  }

  const remindAt = new Date(deadline.getTime() - 60 * 60000)
  return now.getTime() >= remindAt.getTime() && now.getTime() < deadline.getTime()
}
