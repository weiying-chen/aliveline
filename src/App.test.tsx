/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import App from './App'

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

    expect(preview.textContent).toContain('今日做其他事時間是 1時36分')
    expect(preview.textContent).toContain('小編文 1時36分')
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

  it('shows a changed adjusted deadline even when previous equals current', () => {
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

    expect(adjustedTime).not.toBe(originalTime)
    expect(adjusted).toContain('(-20%)')
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
})
