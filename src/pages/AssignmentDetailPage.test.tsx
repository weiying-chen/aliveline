/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AssignmentDetailPage } from './AssignmentDetailPage'
import { buildAssignment } from '../utils/assignmentModel'

const LS_ASSIGNMENTS_KEY = 'aliveline:assignments'

vi.mock('../App', () => ({
  default: ({ selectedAssignmentId }: { selectedAssignmentId?: string }) => (
    <div>Selected assignment: {selectedAssignmentId ?? 'none'}</div>
  ),
}))

describe('AssignmentDetailPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resolves selected assignment from top-level nested list by index', () => {
    const activeRoot = buildAssignment({
      id: 'assignment-a',
      title: 'Active root',
      deadline: '2026-05-01T10:00:00.000Z',
    })
    const another = buildAssignment({
      id: 'assignment-b',
      title: 'Another root',
      deadline: '2026-05-01T11:00:00.000Z',
    })

    localStorage.setItem(
      LS_ASSIGNMENTS_KEY,
      JSON.stringify({
        assignments: [{ ...activeRoot, children: [] }, { ...another, children: [] }],
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

    expect(screen.getByText('Selected assignment: assignment-a')).toBeTruthy()
  })
})
