import { pad2 } from './time'

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

export function formatMessageDate(d: Date) {
  const month = d.getMonth() + 1
  const day = d.getDate()
  const weekday = WEEKDAY_CN[d.getDay()]
  const hours = pad2(d.getHours())
  const minutes = pad2(d.getMinutes())
  return `${month}/${day}（${weekday}）${hours}:${minutes}`
}

export type AssignmentEntry = {
  text: string
  minutes: number
}

type DeadlineExtensionMessageOptions = {
  previous: Date
  next: Date
  assignments?: AssignmentEntry[]
  assignment?: string
  assignee?: string
}

function formatAssignmentLine(item: AssignmentEntry) {
  const trimmed = item.text.trim()
  if (!trimmed) return ''
  return `${trimmed} ${formatDurationForMessage(item.minutes)}`
}

function aggregateAssignmentsForMessage(assignments: AssignmentEntry[]) {
  const totals = new Map<string, number>()
  const orderedNames: string[] = []

  for (const item of assignments) {
    const name = item.text.trim()
    if (!name || item.minutes <= 0) continue
    if (!totals.has(name)) orderedNames.push(name)
    totals.set(name, (totals.get(name) ?? 0) + item.minutes)
  }

  return orderedNames.map((name) => ({
    text: name,
    minutes: totals.get(name) ?? 0,
  }))
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

function formatDurationForMessage(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) return `${hours}時${minutes}分`
  if (hours > 0) return `${hours}時`
  return `${minutes}分`
}

export function formatDeadlineExtensionMessage({
  previous,
  next,
  assignments,
  assignment,
  assignee,
}: DeadlineExtensionMessageOptions) {
  const sanitizedAssignments = aggregateAssignmentsForMessage(assignments ?? [])
  const totalMinutes = sanitizedAssignments.reduce((sum, item) => sum + item.minutes, 0)
  const assignmentLines = sanitizedAssignments.map(formatAssignmentLine).filter((line) => line.length > 0).join('\n')
  const prefix =
    assignmentLines.length > 0
      ? `今日做其他事時間是 ${formatDurationForMessage(totalMinutes)}\n\n${assignmentLines}\n\n`
      : ''
  const assignmentPrefix = assignment?.trim() ? `${assignment.trim()}，` : ''
  const assigneeText = assignee?.trim() ? `，請${assignee.trim()}幫我確認` : ''
  const transitionText = next.getTime() >= previous.getTime() ? '延後至' : '提前至'

  return (
    prefix +
    `${assignmentPrefix}deadline由${formatMessageDate(previous)}，${transitionText}${formatMessageDate(next)}${assigneeText}，謝謝。`
  )
}
