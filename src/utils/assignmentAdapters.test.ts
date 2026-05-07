import { describe, expect, it } from 'vitest'

import type { Assignment } from './assignmentModel'
import {
  fromLegacyAssignmentDraft,
  toLegacyAssignmentDraft,
  type LegacyAssignmentDraft,
} from './assignmentAdapters'

describe('fromLegacyAssignmentDraft', () => {
  it('maps legacy assignment and assignments into unified assignments with extends relations', () => {
    const legacy: LegacyAssignmentDraft = {
      assignmentTitle: '  Translation batch  ',
      deadline: '2026-05-01T10:00:00.000Z',
      assignments: [
        { text: '  Assignment A ', minutes: 30 },
        { text: 'Assignment B', minutes: 95.5 },
        { text: ' ', minutes: 50 },
        { text: 'Assignment C', minutes: 0 },
      ],
    }

    const assignments = fromLegacyAssignmentDraft(legacy)

    expect(assignments).toEqual([
      {
        id: 'legacy-root',
        title: 'Translation batch',
        deadline: '2026-05-01T10:00:00.000Z',
        comments: [],
        relations: [
          { assignmentId: 'legacy-item-0', type: 'extends' },
          { assignmentId: 'legacy-item-1', type: 'extends' },
        ],
      },
      {
        id: 'legacy-item-0',
        title: 'Assignment A',
        deadline: '2026-05-01T10:00:00.000Z',
        comments: [],
        workMinutes: 30,
        relations: [],
      },
      {
        id: 'legacy-item-1',
        title: 'Assignment B',
        deadline: '2026-05-01T10:00:00.000Z',
        comments: [],
        workMinutes: 96,
        relations: [],
      },
    ])
  })
})

describe('toLegacyAssignmentDraft', () => {
  it('maps root assignment and extends-linked children back to legacy draft', () => {
    const assignments: Assignment[] = [
      {
        id: 'legacy-root',
        title: 'Main assignment',
        deadline: '2026-05-02T10:00:00.000Z',
        comments: [],
        relations: [
          { assignmentId: 'a', type: 'extends' },
          { assignmentId: 'b', type: 'extends' },
        ],
      },
      {
        id: 'a',
        title: 'Assignment A',
        deadline: '2026-05-02T10:00:00.000Z',
        comments: [],
        workMinutes: 45,
        relations: [],
      },
      {
        id: 'b',
        title: 'Assignment B',
        deadline: '2026-05-02T11:00:00.000Z',
        comments: [],
        workMinutes: 80,
        relations: [],
      },
    ]

    expect(toLegacyAssignmentDraft(assignments, 'legacy-root')).toEqual({
      assignmentTitle: 'Main assignment',
      deadline: '2026-05-02T10:00:00.000Z',
      assignments: [
        { text: 'Assignment A', minutes: 45 },
        { text: 'Assignment B', minutes: 80 },
      ],
    })
  })

  it('falls back to first assignment as root when root id is omitted', () => {
    const assignments: Assignment[] = [
      {
        id: 'x',
        title: 'X',
        deadline: '2026-05-03T10:00:00.000Z',
        comments: [],
        relations: [],
      },
    ]

    expect(toLegacyAssignmentDraft(assignments)).toEqual({
      assignmentTitle: 'X',
      deadline: '2026-05-03T10:00:00.000Z',
      assignments: [],
    })
  })
})
