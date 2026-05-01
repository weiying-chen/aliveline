import { Navigate, Route, Routes } from 'react-router-dom'

import App from './App'
import { AssignmentDetailPage } from './pages/AssignmentDetailPage'
import { AssignmentsPage } from './pages/AssignmentsPage'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/assignments" element={<AssignmentsPage />} />
      <Route path="/assignments/view/:itemIndex" element={<AssignmentDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
