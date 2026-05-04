/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { DateTimeInput } from './DateTimeInput'

describe('DateTimeInput', () => {
  it('snaps out-of-work values before emitting change', () => {
    const onChange = vi.fn()

    render(
      <DateTimeInput
        value="2026-04-10T08:00"
        onChange={onChange}
        ariaLabel="Start time"
      />
    )

    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2026-04-10T12:00' },
    })

    expect(onChange).toHaveBeenCalledWith('2026-04-10T13:00', expect.any(Date))
  })
})
