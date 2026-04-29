/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'

function readHoursMinutes(label: string) {
  const text = screen.getByLabelText(label).textContent ?? ''
  const match = text.match(/(\d+)h (\d+)m/)
  if (!match) {
    throw new Error(`Unable to parse hours/minutes from: ${text}`)
  }
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  }
}

describe('App deadline behavior', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('extends main deadline when adding task entries', () => {
    const { container } = render(<App />)
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    const deadlineTextBefore = container.querySelector('.deadline')?.textContent
    expect(deadlineTextBefore).toContain('2026-04-10')
    expect(deadlineTextBefore).toContain('12:00 PM')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'English news + recording' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    const deadlineTextAfter = container.querySelector('.deadline')?.textContent
    expect(deadlineTextAfter).toContain('3:00 PM')
    expect(deadlineTextAfter).not.toBe(deadlineTextBefore)
  })

  it('shows deadline message with previous and updated deadline after adding task time', () => {
    const { container } = render(<App />)
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    fireEvent.change(screen.getByLabelText('Assignment name'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(
      screen.getByLabelText('Confirmed by', {
        selector: 'input#deadline-extension-confirmed-by',
      }),
      {
      target: { value: 'Emily Ding' },
      }
    )

    const preview = screen.getByLabelText('Deadline extension message preview')
    expect(preview.textContent).toBe(
      '今日做其他事時間是 2時\n\n' +
        '英文新聞+錄音 2時\n\n' +
        '3集大愛真健康，deadline由4/10（五）12:00，延後至4/10（五）15:00，請Emily Ding幫我確認，謝謝。'
    )
    expect(container.querySelector('.deadline')?.textContent).toContain('3:00 PM')
  })

  it('shows the same deadline message when unified assignment model flag is enabled', () => {
    localStorage.setItem('aliveline:feature-unified-assignments-model', 'true')
    const { container } = render(<App />)
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    fireEvent.change(screen.getByLabelText('Assignment name'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(
      screen.getByLabelText('Confirmed by', {
        selector: 'input#deadline-extension-confirmed-by',
      }),
      {
        target: { value: 'Emily Ding' },
      }
    )

    const preview = screen.getByLabelText('Deadline extension message preview')
    expect(preview.textContent).toBe(
      '今日做其他事時間是 2時\n\n' +
        '英文新聞+錄音 2時\n\n' +
        '3集大愛真健康，deadline由4/10（五）12:00，延後至4/10（五）15:00，請Emily Ding幫我確認，謝謝。'
    )
    expect(container.querySelector('.deadline')?.textContent).toContain('3:00 PM')
  })

  it('shows the same task due time when unified assignment model flag is enabled', () => {
    localStorage.setItem('aliveline:feature-unified-assignments-model', 'true')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'English news + recording' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    expect(screen.getAllByLabelText('Task due time display')[0].textContent).toContain('2h')
  })

  it('toggles original and adjusted values in place for planning fields', () => {
    render(<App />)
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'English news + recording' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    const toggle = screen.getByRole('button', { name: 'Toggle original and adjusted schedule' })
    const previousBefore = screen.getByLabelText('Previous deadline display').textContent
    const deadlineValueBefore = screen.getByLabelText('Current deadline display').textContent
    const remainingBefore = screen.getByLabelText('Remaining work time display').textContent

    expect(previousBefore).not.toContain('(-20%)')
    expect(deadlineValueBefore).not.toContain('(-20%)')
    expect(remainingBefore).not.toContain('(-20%)')
    expect(screen.getAllByLabelText('Task due time display')[0].textContent).toContain('2h')

    fireEvent.click(toggle)

    expect(screen.getByLabelText('Previous deadline display').textContent).toContain('(-20%)')
    expect(screen.getByLabelText('Current deadline display').textContent).toContain('(-20%)')
    expect(screen.getByLabelText('Remaining work time display').textContent).toContain('(-20%)')
    expect(screen.getAllByLabelText('Task due time display')[0].textContent).toContain('(-20%)')
    expect(screen.getByLabelText('Current deadline display').textContent).not.toBe(deadlineValueBefore)
  })

  it('persists the schedule view mode in local storage', () => {
    render(<App />)
    const toggle = screen.getByRole('button', { name: 'Toggle original and adjusted schedule' })

    fireEvent.click(toggle)
    expect(localStorage.getItem('aliveline:schedule-view')).toBe('adjusted')

    fireEvent.click(toggle)
    expect(localStorage.getItem('aliveline:schedule-view')).toBe('original')
  })

  it('updates deadline extension preview content in adjusted view', () => {
    render(<App />)
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2099-04-10T12:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '小編文' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    fireEvent.change(screen.getByLabelText('Assignment name'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(
      screen.getByLabelText('Confirmed by', {
        selector: 'input#deadline-extension-confirmed-by',
      }),
      {
        target: { value: 'Emily Ding' },
      }
    )

    const preview = screen.getByLabelText('Deadline extension message preview')
    expect(preview.textContent).toContain('今日做其他事時間是 2時')
    expect(preview.textContent).toContain('小編文 2時')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))

    expect(preview.textContent).toContain('今日做其他事時間是 1時40分')
    expect(preview.textContent).toContain('小編文 1時40分')
    expect(preview.textContent).not.toContain('(-20%)')
  })

  it('shows next assignment message preview using full template', () => {
    render(<App />)
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    fireEvent.change(screen.getByLabelText('Completed assignment'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(screen.getByLabelText('Next assignment'), {
      target: { value: '仁心慧語 (呂紹睿)' },
    })
    fireEvent.change(screen.getByLabelText('Next assignment message confirmed by'), {
      target: { value: 'Emily Ding' },
    })

    const preview = screen.getByLabelText('Next assignment message preview')
    expect(preview.textContent).toBe(
      '已完成3集大愛真健康，接下來會開始翻譯仁心慧語 (呂紹睿)，再麻煩Emily Ding便時幫忙設deadline，從4/10（五）15:00起算，謝謝。'
    )
  })

  it('keeps adjusted deadline fixed instead of drifting with now', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T13:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '小編文' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))
    const adjustedBefore = screen.getByLabelText('Current deadline display').textContent

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000)
    })

    const adjustedAfter = screen.getByLabelText('Current deadline display').textContent
    expect(adjustedAfter).toBe(adjustedBefore)
  })

  it('keeps deadline value unchanged when deadline multiplier is 1.0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T13:00' } })

    const original = screen.getByLabelText('Current deadline display').textContent ?? ''
    const originalTime = original.replace(' (-20%)', '')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))
    const adjusted = screen.getByLabelText('Current deadline display').textContent ?? ''
    const adjustedTime = adjusted.replace(' (-20%)', '')

    expect(adjustedTime).toBe(originalTime)
    expect(adjusted).toContain('(-20%)')
  })

  it('keeps remaining work unchanged when deadline multiplier is 1.0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T16:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '小編文' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    const remainingBefore = screen.getByLabelText('Remaining work time display').textContent ?? ''
    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))

    const adjustedRemaining = screen.getByLabelText('Remaining work time display').textContent ?? ''
    expect(adjustedRemaining.replace(' (-20%)', '')).toBe(remainingBefore)
    expect(adjustedRemaining).toContain('(-20%)')
  })

  it('keeps adjusted deadline stable after reload', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    const first = render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-20T08:55' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))
    const adjustedBefore = screen.getByLabelText('Current deadline display').textContent

    first.unmount()

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    })

    render(<App />)
    const adjustedAfter = screen.getByLabelText('Current deadline display').textContent
    expect(adjustedAfter).toBe(adjustedBefore)
  })

  it('keeps cross-day remaining work unchanged when deadline multiplier is 1.0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 24, 15, 0, 0))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-28T11:00' } })

    const original = readHoursMinutes('Remaining work time display')
    expect(original).toEqual({ hours: 13, minutes: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))
    const adjusted = readHoursMinutes('Remaining work time display')
    expect(adjusted).toEqual(original)
  })

  it('keeps cross-day task-extended remaining unchanged when deadline multiplier is 1.0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 24, 15, 0, 0))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-24T16:00' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cross-day task' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    const original = readHoursMinutes('Remaining work time display')
    expect(original).toEqual({ hours: 9, minutes: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))
    const adjusted = readHoursMinutes('Remaining work time display')
    expect(adjusted).toEqual(original)
  })

  it('uses the same 10-minute rounding as task time in adjusted mode', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T10:20' } })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))

    const adjusted = readHoursMinutes('Remaining work time display')
    expect(adjusted).toEqual({ hours: 0, minutes: 20 })
  })

  it('keeps deadline unchanged when tasks are added later and deadline multiplier is 1.0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    render(<App />)

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T13:00' } })

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000)
    })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Late added task' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle original and adjusted schedule' }))
    const adjustedDeadline = screen.getByLabelText('Current deadline display').textContent ?? ''
    expect(adjustedDeadline).toContain('3:00 PM')
  })

  it('renders assignment history export as an accordion panel', () => {
    render(<App />)

    const header = screen.getByRole('button', { name: 'Assignment history export' })
    expect(header.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows a month label in assignment history export', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))
    expect(screen.getByLabelText('Month')).toBeTruthy()
  })

  it('uses shared muted meta text style for counting and history summary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T06:00:00'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))

    expect(screen.getByText(/Counting from/).classList.contains('metaTextMutedSm')).toBe(true)
    expect(screen.getByText(/assignments, .* hours/).classList.contains('metaTextMutedSm')).toBe(
      true
    )
  })

  it('stores assignment history via unified model when feature flag is enabled', async () => {
    localStorage.setItem('aliveline:feature-unified-assignments-model', 'true')
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWrite,
      },
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Deadline extension message' }))
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Task A' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.change(screen.getByLabelText('Assignment name'), {
      target: { value: 'Main assignment' },
    })
    fireEvent.change(
      screen.getByLabelText('Confirmed by', {
        selector: 'input#deadline-extension-confirmed-by',
      }),
      { target: { value: 'Emily Ding' } }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      const stored = localStorage.getItem('aliveline:assignment-history')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored ?? '[]')
      expect(parsed[0].assignment).toBe('Main assignment')
      expect(parsed[0].tasks).toEqual([{ text: 'Task A', minutes: 90 }])
    })
  })

  it('boots from assignment draft v2 storage', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = `${now.getMonth() + 1}`.padStart(2, '0')
    const d = `${now.getDate()}`.padStart(2, '0')
    localStorage.setItem('aliveline:daily-clear', `${y}-${m}-${d}`)
    localStorage.setItem(
      'aliveline:assignment-draft-v2',
      JSON.stringify({
        deadlineIso: '2026-04-10T12:00:00.000Z',
        assignmentTitle: 'Boot assignment',
        tasks: [{ text: 'Boot task', minutes: 50 }],
      })
    )

    render(<App />)

    expect(screen.getByLabelText('Current deadline display').textContent).toContain('2026-04-10')
    expect(screen.getAllByLabelText('Task due time display')[0].textContent).toContain('50m')

    fireEvent.click(screen.getByRole('button', { name: 'Deadline extension message' }))
    expect((screen.getByLabelText('Assignment name') as HTMLInputElement).value).toBe(
      'Boot assignment'
    )
  })

})
