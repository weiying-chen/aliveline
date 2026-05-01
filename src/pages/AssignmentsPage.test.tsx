/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AssignmentsPage } from './AssignmentsPage'
import { buildAssignment } from '../utils/assignmentModel'

const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'

describe('AssignmentsPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inserts new assignments at the top', () => {
    const root = buildAssignment({
      id: 'legacy-root',
      title: 'Assignment',
      deadlineIso: '2026-05-01T09:00:00.000Z',
      relations: [{ assignmentId: 'assignment-old', type: 'extends' }],
    })
    const old = buildAssignment({
      id: 'assignment-old',
      title: 'Old assignment',
      deadlineIso: '2026-05-01T08:00:00.000Z',
    })

    localStorage.setItem(
      LS_ASSIGNMENT_DRAFT_KEY,
      JSON.stringify({ rootAssignmentId: root.id, assignments: [root, old] })
    )

    vi.spyOn(Date, 'now').mockReturnValue(1714540800000)

    render(
      <MemoryRouter initialEntries={['/assignments']}>
        <Routes>
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/assignments/view/:itemIndex" element={<div>View page</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add assignment from list page' }))

    const saved = JSON.parse(localStorage.getItem(LS_ASSIGNMENT_DRAFT_KEY) ?? '{}')
    const savedRoot = saved.assignments.find((assignment: { id: string }) => assignment.id === 'legacy-root')

    expect(savedRoot.relations[0]).toEqual({
      assignmentId: 'assignment-1714540800000',
      type: 'extends',
    })
    expect(savedRoot.relations[1]).toEqual({ assignmentId: 'assignment-old', type: 'extends' })
  })
})
