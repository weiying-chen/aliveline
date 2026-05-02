/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AssignmentDetailPage } from './AssignmentDetailPage'
import { buildAssignment } from '../utils/assignmentModel'

const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'

vi.mock('../App', () => ({
  default: ({ selectedAssignmentId }: { selectedAssignmentId?: string }) => (
    <div>Selected assignment: {selectedAssignmentId ?? 'none'}</div>
  ),
}))

describe('AssignmentDetailPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('uses rootAssignmentId to resolve selected assignment', () => {
    const legacyRoot = buildAssignment({
      id: 'legacy-root',
      title: 'Legacy root',
      deadlineIso: '2026-05-01T09:00:00.000Z',
      relations: [{ assignmentId: 'legacy-task-0', type: 'extends' }],
    })
    const legacyTask = buildAssignment({
      id: 'legacy-task-0',
      title: 'Legacy task',
      deadlineIso: '2026-05-01T08:00:00.000Z',
    })
    const activeRoot = buildAssignment({
      id: 'assignment-a',
      title: 'Active root',
      deadlineIso: '2026-05-01T10:00:00.000Z',
      relations: [{ assignmentId: 'assignment-a-task-0', type: 'extends' }],
    })
    const activeTask = buildAssignment({
      id: 'assignment-a-task-0',
      title: 'Active task',
      deadlineIso: '2026-05-01T11:00:00.000Z',
    })

    localStorage.setItem(
      LS_ASSIGNMENT_DRAFT_KEY,
      JSON.stringify({
        rootAssignmentId: 'assignment-a',
        assignments: [legacyRoot, legacyTask, activeRoot, activeTask],
      })
    )

    render(
      <MemoryRouter initialEntries={['/assignments/view/0']}>
        <Routes>
          <Route path="/assignments" element={<div>Assignments list</div>} />
          <Route path="/assignments/view/:itemIndex" element={<AssignmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Selected assignment: assignment-a-task-0')).toBeTruthy()
  })
})
