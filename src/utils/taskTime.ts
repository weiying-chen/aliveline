import { formatDuration } from './deadlineHistory'
import { fmtTime } from './time'
import { addWorkMinutes } from './workTime'

export type TaskMinutesEntry = {
  minutes: number
}

const MINUTE_STEP = 10

function isNonNegativeIntegerText(value: string) {
  return /^\d+$/.test(value)
}

function isIntegerText(value: string) {
  return /^-?\d+$/.test(value)
}

export function minutesFromTimeParts(hoursText: string, minutesText: string) {
  const trimmedHours = hoursText.trim()
  const trimmedMinutes = minutesText.trim()

  if (!trimmedHours && !trimmedMinutes) return null

  const hours = trimmedHours ? Number(trimmedHours) : 0
  const minutes = trimmedMinutes ? Number(trimmedMinutes) : 0

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || minutes < 0) return null

  const total = Math.round((hours * 60 + minutes) / MINUTE_STEP) * MINUTE_STEP
  return total > 0 ? total : null
}

export function normalizeTaskTimeParts(hoursText: string, minutesText: string) {
  const trimmedHours = hoursText.trim()
  const trimmedMinutes = minutesText.trim()

  if (!trimmedMinutes || !isIntegerText(trimmedMinutes)) {
    return { hoursText, minutesText }
  }

  const minutes = Number(trimmedMinutes)
  if (minutes >= 0 && minutes < 60) {
    return { hoursText, minutesText }
  }

  if (trimmedHours && !isNonNegativeIntegerText(trimmedHours)) {
    return { hoursText, minutesText }
  }

  const hours = trimmedHours ? Number(trimmedHours) : 0
  const totalMinutes = hours * 60 + minutes
  if (totalMinutes <= 0) {
    return { hoursText: '0', minutesText: '0' }
  }

  return {
    hoursText: String(Math.floor(totalMinutes / 60)),
    minutesText: String(totalMinutes % 60),
  }
}

export function calculateTaskFinishTimes(start: Date, tasks: TaskMinutesEntry[]) {
  let totalMinutes = 0
  return tasks.map((task) => {
    totalMinutes += task.minutes
    return addWorkMinutes(start, totalMinutes)
  })
}

export function formatTaskTimeWithDuration(finishAt: Date, minutes: number) {
  return `Due ${fmtTime(finishAt)} • ${formatDuration(minutes)}`
}

export function stepMinutesText(current: string, delta: number) {
  const trimmed = current.trim()
  const base = trimmed.length > 0 && /^-?\d+$/.test(trimmed) ? Number(trimmed) : 0
  return String(base + delta)
}

export function stepHoursText(current: string, delta: number) {
  const trimmed = current.trim()
  const base = trimmed.length > 0 && /^\d+$/.test(trimmed) ? Number(trimmed) : 0
  return String(Math.max(0, base + delta))
}
