import type { ReactNode } from 'react'

type AssignmentRowProps = {
  title: string
  middle: ReactNode
  action: ReactNode
}

export function AssignmentRow({ title, middle, action }: AssignmentRowProps) {
  return (
    <div className="assignmentRow">
      <div className="assignmentInfo">
        <span className="assignmentName">{title}</span>
      </div>
      {middle}
      {action}
    </div>
  )
}
