import { forwardRef } from 'react'

import { parseDatetimeLocalValue, toDatetimeLocalValue } from '../utils/time'
import { isInWorkTime, nextWorkStart } from '../utils/workTime'

type DateTimeInputProps = {
  value: string
  onChange: (nextValue: string, nextDate: Date | null) => void
  className?: string
  ariaLabel: string
}

export function snapToWorkTime(value: Date) {
  return isInWorkTime(value) ? value : nextWorkStart(value)
}

export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  ({ value, onChange, className, ariaLabel }, ref) => {
    return (
      <input
        ref={ref}
        className={className}
        type="datetime-local"
        value={value}
        onChange={(event) => {
          const parsed = parseDatetimeLocalValue(event.target.value)
          const snapped = parsed ? snapToWorkTime(parsed) : null
          onChange(snapped ? toDatetimeLocalValue(snapped) : event.target.value, snapped)
        }}
        aria-label={ariaLabel}
      />
    )
  }
)

DateTimeInput.displayName = 'DateTimeInput'
