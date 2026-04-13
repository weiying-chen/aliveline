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
    expect(preview.textContent).toContain('deadline由4/10（五）12:00，提前至4/10（五）15:00')
    expect(preview.textContent).not.toContain('延後0分')
    expect(container.querySelector('.deadline')?.textContent).toContain('3:00 PM')
  })
})
