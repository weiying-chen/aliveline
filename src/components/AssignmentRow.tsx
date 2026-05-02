import type { ReactNode } from 'react'

type AssignmentRowProps = {
  title: string
  meta: ReactNode
  action: ReactNode
}

export function AssignmentRow({ title, meta, action }: AssignmentRowProps) {
  return (
    <div className="assignmentRow">
      <div className="assignmentInfo">
        <span className="assignmentName">{title}</span>
      </div>
      {meta}
      {action}
    </div>
  )
}
