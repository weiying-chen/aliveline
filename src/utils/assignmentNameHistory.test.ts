import { describe, expect, it } from 'vitest'

import { recentAssignmentNames, updateRecentAssignmentNames } from './assignmentNameHistory'

describe('recentAssignmentNames', () => {
  it('returns an empty list when there are no entries', () => {
    expect(recentAssignmentNames([])).toEqual([])
  })

  it('returns the most recent unique names first', () => {
    const entries = [
      { text: 'One', minutes: 15 },
      { text: 'Two', minutes: 30 },
      { text: 'One', minutes: 45 },
      { text: 'Three', minutes: 10 },
      { text: 'Two', minutes: 5 },
    ]

    expect(recentAssignmentNames(entries)).toEqual(['Two', 'Three', 'One'])
  })

  it('trims names and skips empty strings', () => {
    const entries = [
      { text: '  ', minutes: 10 },
      { text: ' Alpha ', minutes: 20 },
      { text: 'Beta', minutes: 30 },
      { text: 'Alpha', minutes: 40 },
    ]

    expect(recentAssignmentNames(entries)).toEqual(['Alpha', 'Beta'])
  })

  it('respects the limit', () => {
    const entries = [
      { text: 'One', minutes: 15 },
      { text: 'Two', minutes: 30 },
      { text: 'Three', minutes: 45 },
      { text: 'Four', minutes: 10 },
    ]

    expect(recentAssignmentNames(entries, 2)).toEqual(['Four', 'Three'])
  })
})

describe('updateRecentAssignmentNames', () => {
  it('adds a new name to the front', () => {
    expect(updateRecentAssignmentNames(['Beta', 'Alpha'], 'Gamma')).toEqual([
      'Gamma',
      'Beta',
      'Alpha',
    ])
  })

  it('dedupes and moves existing names to the front', () => {
    expect(updateRecentAssignmentNames(['Beta', 'Alpha'], 'Alpha')).toEqual(['Alpha', 'Beta'])
  })

  it('trims and skips empty values', () => {
    expect(updateRecentAssignmentNames(['Beta'], '  ')).toEqual(['Beta'])
  })

  it('respects the limit', () => {
    expect(updateRecentAssignmentNames(['One', 'Two', 'Three'], 'Four', 2)).toEqual(['Four', 'One'])
  })
})
