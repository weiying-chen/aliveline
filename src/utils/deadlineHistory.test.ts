import { describe, expect, it } from 'vitest'

import { formatDeadlineExtensionMessage, formatMessageDate } from './deadlineHistory'

describe('formatMessageDate', () => {
  it('formats date with weekday and 24h time', () => {
    const d = new Date(2025, 0, 8, 14, 25)
    expect(formatMessageDate(d)).toBe('1/8（三）14:25')
  })
})

describe('formatDeadlineExtensionMessage', () => {
  it('builds a multi-line deadline extension update', () => {
    const previous = new Date(2025, 0, 8, 14, 25)
    const next = new Date(2025, 0, 8, 15, 10)
    const tasks = [
      { text: '討論小編文', minutes: 45 },
      { text: '其他任務', minutes: 15 },
    ]
    const message = formatDeadlineExtensionMessage({
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
    const message = formatDeadlineExtensionMessage({ previous, next })

    expect(message).toBe('deadline由1/8（三）15:10，提前至1/8（三）14:25，謝謝。')
  })

  it('merges repeated task names by summing minutes in message lines', () => {
    const previous = new Date(2025, 0, 8, 14, 25)
    const next = new Date(2025, 0, 8, 19, 35)
    const tasks = [
      { text: '英文新聞+錄音', minutes: 180 },
      { text: '英文新聞+錄音', minutes: 130 },
      { text: '小編文', minutes: 60 },
      { text: '小編文', minutes: 60 },
    ]

    const message = formatDeadlineExtensionMessage({
      previous,
      next,
      tasks,
    })

    expect(message).toBe(
      '今日做其他事時間是 7時10分\n\n' +
        '英文新聞+錄音 5時10分\n' +
        '小編文 2時\n\n' +
        'deadline由1/8（三）14:25，延後至1/8（三）19:35，謝謝。'
    )
  })
})
