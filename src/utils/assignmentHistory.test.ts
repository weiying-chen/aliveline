import { describe, expect, it } from 'vitest'

import {
  buildAssignmentHistoryEntry,
  exportAssignmentHistoryCsv,
  exportAssignmentHistoryJson,
  filterAssignmentHistoryEntriesByMonth,
  sumAssignmentHistoryEntryMinutes,
  type AssignmentHistoryEntry,
} from './assignmentHistory'

describe('buildAssignmentHistoryEntry', () => {
  it('builds a normalized snapshot with totals', () => {
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
          { text: 'Task B', minutes: 0 },
        ],
      },
      now
    )

    expect(entry.createdAtIso).toBe('2026-04-27T10:30:00.000Z')
    expect(entry.assignment).toBe('Translation batch')
    expect(entry.deadlineIso).toBe('2026-04-29T04:00:00.000Z')
    expect(entry.confirmedBy).toBe('Emily Ding')
    expect(entry.tasks).toEqual([{ text: 'Task A', minutes: 90 }])
    expect(entry.totalMinutes).toBe(90)
  })
})

describe('filterAssignmentHistoryEntriesByMonth', () => {
  it('keeps only entries inside the requested year-month by deadline', () => {
    const entries: AssignmentHistoryEntry[] = [
      {
        createdAtIso: '2026-03-30T00:00:00.000Z',
        assignment: 'A',
        deadlineIso: '2026-03-31T12:00:00.000Z',
        confirmedBy: '',
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'original',
        source: 'deadline_extension_copy',
        tasks: [],
        totalMinutes: 0,
      },
      {
        createdAtIso: '2026-04-02T00:00:00.000Z',
        assignment: 'B',
        deadlineIso: '2026-04-15T12:00:00.000Z',
        confirmedBy: '',
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'original',
        source: 'deadline_extension_copy',
        tasks: [],
        totalMinutes: 60,
      },
    ]

    const filtered = filterAssignmentHistoryEntriesByMonth(entries, 2026, 4)
    expect(filtered.map((item) => item.assignment)).toEqual(['B'])
  })
})

describe('sumAssignmentHistoryEntryMinutes', () => {
  it('sums all minutes across entries', () => {
    const total = sumAssignmentHistoryEntryMinutes([
      {
        createdAtIso: '2026-04-01T00:00:00.000Z',
        assignment: 'A',
        deadlineIso: '2026-04-02T00:00:00.000Z',
        confirmedBy: '',
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'original',
        source: 'deadline_extension_copy',
        tasks: [],
        totalMinutes: 30,
      },
      {
        createdAtIso: '2026-04-03T00:00:00.000Z',
        assignment: 'B',
        deadlineIso: '2026-04-04T00:00:00.000Z',
        confirmedBy: '',
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'original',
        source: 'deadline_extension_copy',
        tasks: [],
        totalMinutes: 90,
      },
    ])
    expect(total).toBe(120)
  })
})

describe('exportAssignmentHistoryCsv', () => {
  it('exports one row per assignment with task text and hours', () => {
    const csv = exportAssignmentHistoryCsv([
      {
        createdAtIso: '2026-04-01T08:00:00.000Z',
        assignment: 'Alpha',
        deadlineIso: '2026-04-02T09:00:00.000Z',
        confirmedBy: 'Emily',
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'original',
        source: 'deadline_extension_copy',
        tasks: [
          { text: 'Task A', minutes: 30 },
          { text: 'Task B', minutes: 60 },
        ],
        totalMinutes: 90,
      },
    ])

    expect(csv).toContain(
      'created_at,assignment,deadline,confirmed_by,next_assignment,next_assignment_confirmed_by,total_minutes,total_hours,schedule_view,source,tasks'
    )
    expect(csv).toContain(
      '2026-04-01T08:00:00.000Z,Alpha,2026-04-02T09:00:00.000Z,Emily,,,90,1.50,original,deadline_extension_copy,Task A (30m); Task B (60m)'
    )
  })
})

describe('exportAssignmentHistoryJson', () => {
  it('exports stable pretty json', () => {
    const json = exportAssignmentHistoryJson([
      {
        createdAtIso: '2026-04-01T08:00:00.000Z',
        assignment: 'Alpha',
        deadlineIso: '2026-04-02T09:00:00.000Z',
        confirmedBy: 'Emily',
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'original',
        source: 'deadline_extension_copy',
        tasks: [],
        totalMinutes: 90,
      },
    ])

    expect(json).toContain('"assignment": "Alpha"')
    expect(json).toContain('\n  {\n')
  })
})
