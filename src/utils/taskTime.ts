import { formatDuration } from './deadlineHistory'
import { fmtTime } from './time'
import { addWorkMinutes } from './workTime'

export type TaskMinutesEntry = {
  minutes: number
}

export function minutesFromTimeParts(hoursText: string, minutesText: string) {
  const trimmedHours = hoursText.trim()
  const trimmedMinutes = minutesText.trim()

  if (!trimmedHours && !trimmedMinutes) return null

  const hours = trimmedHours ? Number(trimmedHours) : 0
  const minutes = trimmedMinutes ? Number(trimmedMinutes) : 0

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || minutes < 0) return null

  const total = Math.round(hours * 60 + minutes)
  return total > 0 ? total : null
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
