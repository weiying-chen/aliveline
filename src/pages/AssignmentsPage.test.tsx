/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AssignmentsPage } from './AssignmentsPage'
import { buildAssignment } from '../utils/assignmentModel'

const LS_ASSIGNMENTS_KEY = 'aliveline:assignments'

describe('AssignmentsPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inserts new assignments at the top', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-05-01T00:00:00.000Z'))

    const old = buildAssignment({
      id: 'assignment-old',
      title: 'Old assignment',
      deadline: '2026-05-01T08:00:00.000Z',
    })

    localStorage.setItem(
      LS_ASSIGNMENTS_KEY,
      JSON.stringify({ assignments: [{ ...old, children: [] }] })
    )
    render(
      <MemoryRouter initialEntries={['/assignments']}>
        <Routes>
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/assignments/view/:itemIndex" element={<div>View page</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add assignment from list page' }))

    const saved = JSON.parse(localStorage.getItem(LS_ASSIGNMENTS_KEY) ?? '{}')
    expect(saved.assignments[0].id).toBe(`assignment-${new Date('2024-05-01T00:00:00.000Z').getTime()}`)
    expect(saved.assignments[0].createdAt).toBe('2024-05-01T00:00:00.000Z')
    expect(saved.assignments[1].id).toBe('assignment-old')
  })
})
