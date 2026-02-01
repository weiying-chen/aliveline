import { describe, expect, it } from 'vitest'

import { recentTaskNames } from './taskHistory'

describe('recentTaskNames', () => {
  it('returns an empty list when there are no entries', () => {
    expect(recentTaskNames([])).toEqual([])
  })

  it('returns the most recent unique names first', () => {
    const entries = [
      { text: 'One', minutes: 15 },
      { text: 'Two', minutes: 30 },
      { text: 'One', minutes: 45 },
      { text: 'Three', minutes: 10 },
      { text: 'Two', minutes: 5 },
    ]

    expect(recentTaskNames(entries)).toEqual(['Two', 'Three', 'One'])
  })

  it('trims names and skips empty strings', () => {
    const entries = [
      { text: '  ', minutes: 10 },
      { text: ' Alpha ', minutes: 20 },
      { text: 'Beta', minutes: 30 },
      { text: 'Alpha', minutes: 40 },
    ]

    expect(recentTaskNames(entries)).toEqual(['Alpha', 'Beta'])
  })

  it('respects the limit', () => {
    const entries = [
      { text: 'One', minutes: 15 },
      { text: 'Two', minutes: 30 },
      { text: 'Three', minutes: 45 },
      { text: 'Four', minutes: 10 },
    ]

    expect(recentTaskNames(entries, 2)).toEqual(['Four', 'Three'])
  })
})
