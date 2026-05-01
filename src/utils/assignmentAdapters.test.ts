import { describe, expect, it } from 'vitest'

import type { Assignment } from './assignmentModel'
import {
  fromLegacyAssignmentDraft,
  toLegacyAssignmentDraft,
  type LegacyAssignmentDraft,
} from './assignmentAdapters'

describe('fromLegacyAssignmentDraft', () => {
  it('maps legacy assignment and tasks into unified assignments with extends relations', () => {
    const legacy: LegacyAssignmentDraft = {
      assignmentTitle: '  Translation batch  ',
      deadlineIso: '2026-05-01T10:00:00.000Z',
      tasks: [
        { text: '  Task A ', minutes: 30 },
        { text: 'Task B', minutes: 95.5 },
        { text: ' ', minutes: 50 },
        { text: 'Task C', minutes: 0 },
      ],
    }

    const assignments = fromLegacyAssignmentDraft(legacy)

    expect(assignments).toEqual([
      {
        id: 'legacy-root',
        title: 'Translation batch',
        deadlineIso: '2026-05-01T10:00:00.000Z',
        comments: [],
        relations: [
          { assignmentId: 'legacy-task-0', type: 'extends' },
          { assignmentId: 'legacy-task-1', type: 'extends' },
        ],
      },
      {
        id: 'legacy-task-0',
        title: 'Task A',
        deadlineIso: '2026-05-01T10:00:00.000Z',
        comments: [],
        estimateMinutes: 30,
        relations: [],
      },
      {
        id: 'legacy-task-1',
        title: 'Task B',
        deadlineIso: '2026-05-01T10:00:00.000Z',
        comments: [],
        estimateMinutes: 96,
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
        deadlineIso: '2026-05-02T10:00:00.000Z',
        comments: [],
        relations: [
          { assignmentId: 'a', type: 'extends' },
          { assignmentId: 'b', type: 'extends' },
        ],
      },
      {
        id: 'a',
        title: 'Task A',
        deadlineIso: '2026-05-02T10:00:00.000Z',
        comments: [],
        estimateMinutes: 45,
        relations: [],
      },
      {
        id: 'b',
        title: 'Task B',
        deadlineIso: '2026-05-02T11:00:00.000Z',
        comments: [],
        estimateMinutes: 80,
        relations: [],
      },
    ]

    expect(toLegacyAssignmentDraft(assignments, 'legacy-root')).toEqual({
      assignmentTitle: 'Main assignment',
      deadlineIso: '2026-05-02T10:00:00.000Z',
      tasks: [
        { text: 'Task A', minutes: 45 },
        { text: 'Task B', minutes: 80 },
      ],
    })
  })

  it('falls back to first assignment as root when root id is omitted', () => {
    const assignments: Assignment[] = [
      {
        id: 'x',
        title: 'X',
        deadlineIso: '2026-05-03T10:00:00.000Z',
        comments: [],
        relations: [],
      },
    ]

    expect(toLegacyAssignmentDraft(assignments)).toEqual({
      assignmentTitle: 'X',
      deadlineIso: '2026-05-03T10:00:00.000Z',
      tasks: [],
    })
  })
})
