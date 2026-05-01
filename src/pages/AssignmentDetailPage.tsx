import { Navigate, useParams } from 'react-router-dom'

import App from '../App'

export function AssignmentDetailPage() {
  const { assignmentId } = useParams()

  if (!assignmentId) {
    return <Navigate to="/assignments" replace />
  }

  return <App selectedAssignmentId={assignmentId} showTopNav={true} persistDraft={false} />
}
