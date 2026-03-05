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
  const sanitizedTasks =
    tasks?.filter((item) => item.text.trim().length > 0 && item.minutes > 0) ?? []
  const totalMinutes = sanitizedTasks.reduce((sum, item) => sum + item.minutes, 0)
  const taskLines = sanitizedTasks.map(formatTaskLine).filter((line) => line.length > 0).join('\n')
  const prefix =
    taskLines.length > 0
      ? `今日做其他事時間是 ${formatDurationForMessage(totalMinutes)}\n\n${taskLines}\n\n`
      : ''
  const action = next.getTime() < previous.getTime() ? '提前至' : '延後至'
  const assignmentPrefix = assignment?.trim() ? `${assignment.trim()}，` : ''
  const assigneeText = assignee?.trim() ? `，請${assignee.trim()}幫我確認` : ''

  return (
    prefix +
    `${assignmentPrefix}deadline由${formatMessageDate(previous)}，${action}${formatMessageDate(next)}${assigneeText}，謝謝。`
  )
}
