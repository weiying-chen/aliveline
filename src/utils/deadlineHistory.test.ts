import { describe, expect, it } from 'vitest'

import { formatTeamsDate, formatTeamsMessage } from './deadlineHistory'

describe('formatTeamsDate', () => {
  it('formats date with weekday and 24h time', () => {
    const d = new Date(2025, 0, 8, 14, 25)
    expect(formatTeamsDate(d)).toBe('1/8（三）14:25')
  })
})

describe('formatTeamsMessage', () => {
  it('builds a multi-line Teams update', () => {
    const previous = new Date(2025, 0, 8, 14, 25)
    const next = new Date(2025, 0, 8, 15, 10)
    const tasks = [
      { text: '討論小編文', minutes: 45 },
      { text: '其他任務', minutes: 15 },
    ]
    const message = formatTeamsMessage({
      previous,
      next,
      tasks,
      assignment: '心靈講座（看見自己的天才 - 盧蘇偉）',
      assignee: 'Syharn Shen',
    })

    expect(message).toBe(
      '今日做其他事時間是 1時\n\n' +
        '討論小編文 45分\n' +
        '其他任務 15分\n\n' +
        '心靈講座（看見自己的天才 - 盧蘇偉），deadline由1/8（三）14:25，延後至1/8（三）15:10，請Syharn Shen幫我確認，謝謝。'
    )
  })

  it('uses 提前至 when the deadline moves earlier', () => {
    const previous = new Date(2025, 0, 8, 15, 10)
    const next = new Date(2025, 0, 8, 14, 25)
    const message = formatTeamsMessage({ previous, next })

    expect(message).toBe('deadline由1/8（三）15:10，提前至1/8（三）14:25，謝謝。')
  })
})
