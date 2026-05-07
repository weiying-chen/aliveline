import { describe, expect, it } from 'vitest'

import {
  buildAssignmentHistoryEntry,
  exportAssignmentHistoryJson,
  filterAssignmentHistoryEntriesByMonth,
  sumAssignmentHistoryEntryMinutes,
} from './assignmentHistoryUnified'

describe('buildAssignmentHistoryEntry', () => {
  it('builds unified history entry with root and child assignments', () => {
    const now = new Date('2026-04-27T10:30:00.000Z')
    const deadline = new Date('2026-04-29T04:00:00.000Z')
    const entry = buildAssignmentHistoryEntry(
      {
        assignment: ' Translation batch ',
        deadline,
        confirmedBy: '  Emily Ding ',
        tasks: [
          { text: 'Task A', minutes: 90 },
          { text: '  ', minutes: 30 },
        ],
      },
      now
    )

    expect(entry.createdAt).toBe('2026-04-27T10:30:00.000Z')
    expect(entry.totalMinutes).toBe(90)
    expect(entry.assignments[0].title).toBe('Translation batch')
    expect(entry.assignments[1].title).toBe('Task A')
  })
})

describe('month filter and sum', () => {
  it('filters by deadline month and sums minutes', () => {
    const entries = [
      buildAssignmentHistoryEntry({
        assignment: 'A',
        deadline: new Date('2026-03-31T12:00:00.000Z'),
        confirmedBy: '',
        tasks: [],
      }),
      buildAssignmentHistoryEntry({
        assignment: 'B',
        deadline: new Date('2026-04-15T12:00:00.000Z'),
        confirmedBy: '',
        tasks: [{ text: 'Task B', minutes: 60 }],
      }),
    ]

    const filtered = filterAssignmentHistoryEntriesByMonth(entries, 2026, 4)
    expect(filtered).toHaveLength(1)
    expect(sumAssignmentHistoryEntryMinutes(filtered)).toBe(60)
  })
})

describe('exportAssignmentHistoryJson', () => {
  it('exports unified assignment history as JSON', () => {
    const json = exportAssignmentHistoryJson([
      buildAssignmentHistoryEntry(
        {
          assignment: 'Alpha',
          deadline: new Date('2026-04-02T09:00:00.000Z'),
          confirmedBy: 'Emily',
          tasks: [
            { text: 'Task A', minutes: 30 },
            { text: 'Task B', minutes: 60 },
          ],
        },
        new Date('2026-04-01T08:00:00.000Z')
      ),
    ])

    const parsed = JSON.parse(json)
    expect(parsed[0].rootAssignmentId).toBe('root')
    expect(parsed[0].assignments[0].title).toBe('Alpha')
    expect(parsed[0].assignments[1].title).toBe('Task A')
  })
})
