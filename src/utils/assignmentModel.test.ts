import { describe, expect, it } from 'vitest'

import {
  buildAssignment,
  hasDependencyCycle,
  relationIdsByType,
  type Assignment,
} from './assignmentModel'

describe('buildAssignment', () => {
  it('normalizes title, relations, and work minutes', () => {
    const assignment = buildAssignment({
      id: 'a1',
      title: '  Translate episode  ',
      createdAt: '2026-04-30T09:15:00.000Z',
      owner: '  PM Chen  ',
      deadline: '2026-05-01T10:00:00.000Z',
      workMinutes: 93.7,
      contentMinutes: 18.2,
      relations: [
        { assignmentId: 'a2', type: 'blocks' },
        { assignmentId: ' a2 ', type: 'blocks' },
        { assignmentId: 'a3', type: 'extends' },
        { assignmentId: '   ', type: 'relates_to' },
      ],
      comments: ['  typo in tense  ', ''],
    })

    expect(assignment).toEqual({
      id: 'a1',
      title: 'Translate episode',
      createdAt: '2026-04-30T09:15:00.000Z',
      owner: 'PM Chen',
      deadline: '2026-05-01T10:00:00.000Z',
      workMinutes: 94,
      contentMinutes: 18,
      relations: [
        { assignmentId: 'a2', type: 'blocks' },
        { assignmentId: 'a3', type: 'extends' },
      ],
      comments: ['typo in tense'],
    })
  })

  it('defaults missing fields to safe values', () => {
    const assignment = buildAssignment({
      id: 'a1',
      title: 'Publish draft',
      deadline: '2026-05-02T12:00:00.000Z',
    })

    expect(assignment.relations).toEqual([])
    expect(assignment.workMinutes).toBeUndefined()
    expect(assignment.contentMinutes).toBeUndefined()
    expect(assignment.comments).toEqual([])
    expect(assignment.owner).toBeUndefined()
  })
})

describe('relationIdsByType', () => {
  it('returns only matching relation ids', () => {
    const assignment: Assignment = {
      id: 'a1',
      title: 'A',
      deadline: '2026-05-01T10:00:00.000Z',
      relations: [
        { assignmentId: 'b', type: 'blocks' },
        { assignmentId: 'c', type: 'extends' },
        { assignmentId: 'd', type: 'blocks' },
      ],
      comments: [],
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
        deadline: '2026-05-01T10:00:00.000Z',
        relations: [{ assignmentId: 'b', type: 'blocks' }],
        comments: [],
      },
      {
        id: 'b',
        title: 'B',
        deadline: '2026-05-01T11:00:00.000Z',
        relations: [{ assignmentId: 'c', type: 'blocks' }],
        comments: [],
      },
      {
        id: 'c',
        title: 'C',
        deadline: '2026-05-01T12:00:00.000Z',
        relations: [{ assignmentId: 'a', type: 'blocks' }],
        comments: [],
      },
    ]

    expect(hasDependencyCycle(assignments)).toBe(true)
  })

  it('ignores non-blocking relations for cycle checks', () => {
    const assignments: Assignment[] = [
      {
        id: 'a',
        title: 'A',
        deadline: '2026-05-01T10:00:00.000Z',
        relations: [{ assignmentId: 'b', type: 'extends' }],
        comments: [],
      },
      {
        id: 'b',
        title: 'B',
        deadline: '2026-05-01T11:00:00.000Z',
        relations: [{ assignmentId: 'a', type: 'extends' }],
        comments: [],
      },
    ]

    expect(hasDependencyCycle(assignments)).toBe(false)
  })
})
