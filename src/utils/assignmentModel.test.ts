import { describe, expect, it } from 'vitest'

import {
  buildAssignment,
  hasDependencyCycle,
  relationIdsByType,
  type Assignment,
} from './assignmentModel'

describe('buildAssignment', () => {
  it('normalizes title, relations, and estimate minutes', () => {
    const assignment = buildAssignment({
      id: 'a1',
      title: '  Translate episode  ',
      deadlineIso: '2026-05-01T10:00:00.000Z',
      status: 'in_progress',
      estimateMinutes: 93.7,
      relations: [
        { assignmentId: 'a2', type: 'blocks' },
        { assignmentId: ' a2 ', type: 'blocks' },
        { assignmentId: 'a3', type: 'extends' },
        { assignmentId: '   ', type: 'relates_to' },
      ],
    })

    expect(assignment).toEqual({
      id: 'a1',
      title: 'Translate episode',
      deadlineIso: '2026-05-01T10:00:00.000Z',
      status: 'in_progress',
      estimateMinutes: 94,
      relations: [
        { assignmentId: 'a2', type: 'blocks' },
        { assignmentId: 'a3', type: 'extends' },
      ],
    })
  })

  it('defaults missing fields to safe values', () => {
    const assignment = buildAssignment({
      id: 'a1',
      title: 'Publish draft',
      deadlineIso: '2026-05-02T12:00:00.000Z',
    })

    expect(assignment.status).toBe('todo')
    expect(assignment.relations).toEqual([])
    expect(assignment.estimateMinutes).toBeUndefined()
  })
})

describe('relationIdsByType', () => {
  it('returns only matching relation ids', () => {
    const assignment: Assignment = {
      id: 'a1',
      title: 'A',
      deadlineIso: '2026-05-01T10:00:00.000Z',
      status: 'todo',
      relations: [
        { assignmentId: 'b', type: 'blocks' },
        { assignmentId: 'c', type: 'extends' },
        { assignmentId: 'd', type: 'blocks' },
      ],
    }

    expect(relationIdsByType(assignment, 'blocks')).toEqual(['b', 'd'])
    expect(relationIdsByType(assignment, 'extends')).toEqual(['c'])
  })
})

describe('hasDependencyCycle', () => {
  it('returns true when blocks dependency graph has a cycle', () => {
    const assignments: Assignment[] = [
      {
        id: 'a',
        title: 'A',
        deadlineIso: '2026-05-01T10:00:00.000Z',
        status: 'todo',
        relations: [{ assignmentId: 'b', type: 'blocks' }],
      },
      {
        id: 'b',
        title: 'B',
        deadlineIso: '2026-05-01T11:00:00.000Z',
        status: 'todo',
        relations: [{ assignmentId: 'c', type: 'blocks' }],
      },
      {
        id: 'c',
        title: 'C',
        deadlineIso: '2026-05-01T12:00:00.000Z',
        status: 'todo',
        relations: [{ assignmentId: 'a', type: 'blocks' }],
      },
    ]

    expect(hasDependencyCycle(assignments)).toBe(true)
  })

  it('ignores non-blocking relations for cycle checks', () => {
    const assignments: Assignment[] = [
      {
        id: 'a',
        title: 'A',
        deadlineIso: '2026-05-01T10:00:00.000Z',
        status: 'todo',
        relations: [{ assignmentId: 'b', type: 'extends' }],
      },
      {
        id: 'b',
        title: 'B',
        deadlineIso: '2026-05-01T11:00:00.000Z',
        status: 'todo',
        relations: [{ assignmentId: 'a', type: 'extends' }],
      },
    ]

    expect(hasDependencyCycle(assignments)).toBe(false)
  })
})
