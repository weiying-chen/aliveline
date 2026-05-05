import { formatMessageDate } from './deadlineHistory'

export type NextAssignmentMessageOptions = {
  completedAssignment: string
  nextAssignment: string
  assignee: string
  start: Date
  deadline: Date
}

export function formatNextAssignmentMessage(options: NextAssignmentMessageOptions) {
  const completedAssignment = options.completedAssignment.trim()
  const nextAssignment = options.nextAssignment.trim()
  const assignee = options.assignee.trim()

  if (!completedAssignment || !nextAssignment || !assignee) return ''

  const baseMessage =
    `已完成${completedAssignment}，接下來會開始翻譯${nextAssignment}，` +
    `再麻煩${assignee}便時幫忙設deadline，` +
    `從${formatMessageDate(options.start)}起算，謝謝。`

  return `${baseMessage}\n=====\n之前是1分鐘算1小時，現在改成1分鐘算0.8 小時，謝謝`
}
