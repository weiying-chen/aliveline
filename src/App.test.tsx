/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import App from './App'

describe('App deadline behavior', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
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
    expect(preview.textContent).toContain('deadline由4/10（五）12:00，延後至4/10（五）15:00')
    expect(preview.textContent).not.toContain('延後0分')
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
})
