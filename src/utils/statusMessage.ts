import { formatMessageDate } from './deadlineHistory'

export type StatusMessageOptions = {
  completedAssignment: string
  nextAssignment: string
  assignee: string
  start: Date
  deadline: Date
}

export function formatStatusMessage(options: StatusMessageOptions) {
  const completedAssignment = options.completedAssignment.trim()
  const nextAssignment = options.nextAssignment.trim()
  const assignee = options.assignee.trim()

  if (!completedAssignment || !nextAssignment || !assignee) return ''

  return (
    `已完成${completedAssignment}，接下來會開始翻譯${nextAssignment}，` +
    `再麻煩${assignee}便時幫忙設deadline，` +
    `從${formatMessageDate(options.start)}起算，謝謝。`
  )
}
