import { describe, expect, it } from 'vitest'

import { formatNextAssignmentMessage } from './nextAssignmentMessage'

describe('formatNextAssignmentMessage', () => {
  it('formats a full next assignment message with metadata', () => {
    const start = new Date(2026, 0, 13, 16, 10)
    const deadline = new Date(2026, 0, 16, 9, 10)
    const message = formatNextAssignmentMessage({
      completedAssignment: '"三"人文講堂',
      nextAssignment: '6集仁心慧語 (呂紹睿)',
      assignee: 'Emily Ding',
      start,
      deadline,
    })

    expect(message).toBe(
      '已完成"三"人文講堂，接下來會開始翻譯6集仁心慧語 (呂紹睿)，再麻煩Emily Ding便時幫忙設deadline，從1/13（二）16:10起算，謝謝。\n=====\n之前是1分鐘算1小時，現在改成1分鐘算0.8 小時，謝謝。'
    )
  })

  it('formats without metadata', () => {
    const start = new Date(2026, 0, 13, 10, 5)
    const deadline = new Date(2026, 0, 14, 9, 0)
    const message = formatNextAssignmentMessage({
      completedAssignment: '人文講堂',
      nextAssignment: '仁心慧語',
      assignee: 'Alex',
      start,
      deadline,
    })

    expect(message).toBe(
      '已完成人文講堂，接下來會開始翻譯仁心慧語，再麻煩Alex便時幫忙設deadline，從1/13（二）10:05起算，謝謝。\n=====\n之前是1分鐘算1小時，現在改成1分鐘算0.8 小時，謝謝。'
    )
  })

  it('matches a long-form completion message format', () => {
    const start = new Date(2026, 2, 3, 11, 40)
    const deadline = new Date(2026, 2, 7, 11, 40)
    const message = formatNextAssignmentMessage({
      completedAssignment:
        '7集人物專訪(勇氣來自日常選擇，善意可以被練習，家庭支持能帶來安全感，分享經驗讓人彼此靠近，面對挫折要保持彈性，初入職場需要持續學習，長期投入才看得見成果，反覆練習會讓表達更穩定)',
      nextAssignment: '深度訪談 (如何在壓力下保持清晰思考 - 王小明)',
      assignee: '@pm',
      start,
      deadline,
    })

    expect(message).toBe(
      '已完成7集人物專訪(勇氣來自日常選擇，善意可以被練習，家庭支持能帶來安全感，分享經驗讓人彼此靠近，面對挫折要保持彈性，初入職場需要持續學習，長期投入才看得見成果，反覆練習會讓表達更穩定)，接下來會開始翻譯深度訪談 (如何在壓力下保持清晰思考 - 王小明)，再麻煩@pm便時幫忙設deadline，從3/3（二）11:40起算，謝謝。\n=====\n之前是1分鐘算1小時，現在改成1分鐘算0.8 小時，謝謝。'
    )
  })
})
