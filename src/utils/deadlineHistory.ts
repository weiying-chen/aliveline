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

export type TaskEntry = {
  text: string
  minutes: number
}

type DeadlineExtensionMessageOptions = {
  previous: Date
  next: Date
  tasks?: TaskEntry[]
  assignment?: string
  assignee?: string
}

function formatTaskLine(task: TaskEntry) {
  const trimmed = task.text.trim()
  if (!trimmed) return ''
  return `${trimmed} ${formatDurationForMessage(task.minutes)}`
}

function aggregateTasksForMessage(tasks: TaskEntry[]) {
  const totals = new Map<string, number>()
  const orderedNames: string[] = []

  for (const task of tasks) {
    const name = task.text.trim()
    if (!name || task.minutes <= 0) continue
    if (!totals.has(name)) orderedNames.push(name)
    totals.set(name, (totals.get(name) ?? 0) + task.minutes)
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
  tasks,
  assignment,
  assignee,
}: DeadlineExtensionMessageOptions) {
  const sanitizedTasks = aggregateTasksForMessage(tasks ?? [])
  const totalMinutes = sanitizedTasks.reduce((sum, item) => sum + item.minutes, 0)
  const taskLines = sanitizedTasks.map(formatTaskLine).filter((line) => line.length > 0).join('\n')
  const prefix =
    taskLines.length > 0
      ? `今日做其他事時間是 ${formatDurationForMessage(totalMinutes)}\n\n${taskLines}\n\n`
      : ''
  const assignmentPrefix = assignment?.trim() ? `${assignment.trim()}，` : ''
  const assigneeText = assignee?.trim() ? `，請${assignee.trim()}幫我確認` : ''
  const transitionText = next.getTime() >= previous.getTime() ? '延後至' : '提前至'

  return (
    prefix +
    `${assignmentPrefix}deadline由${formatMessageDate(previous)}，${transitionText}${formatMessageDate(next)}${assigneeText}，謝謝。`
  )
}
