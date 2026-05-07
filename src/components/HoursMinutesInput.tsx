import { applyMinutesDeltaWithCarry, normalizeAssignmentTimeParts, stepHoursText } from '../utils/assignmentTime'

type HoursMinutesInputProps = {
  hoursText: string
  minutesText: string
  onChange: (nextHoursText: string, nextMinutesText: string) => void
  hoursAriaLabel: string
  minutesAriaLabel: string
  hoursPlaceholder?: string
  minutesPlaceholder?: string
  hoursInputId?: string
  minutesInputId?: string
  showLabels?: boolean
  hoursLabel?: string
  minutesLabel?: string
  hoursInputClassName?: string
  minutesInputClassName?: string
  increaseHoursLabel: string
  decreaseHoursLabel: string
  increaseMinutesLabel: string
  decreaseMinutesLabel: string
}

export function HoursMinutesInput({
  hoursText,
  minutesText,
  onChange,
  hoursAriaLabel,
  minutesAriaLabel,
  hoursPlaceholder = 'Hours',
  minutesPlaceholder = 'Minutes',
  hoursInputId,
  minutesInputId,
  showLabels = true,
  hoursLabel = 'Hours',
  minutesLabel = 'Minutes',
  hoursInputClassName,
  minutesInputClassName,
  increaseHoursLabel,
  decreaseHoursLabel,
  increaseMinutesLabel,
  decreaseMinutesLabel,
}: HoursMinutesInputProps) {
  const onHoursChange = (value: string) => {
    onChange(value, minutesText)
  }

  const onMinutesChange = (value: string) => {
    const normalized = normalizeAssignmentTimeParts(hoursText, value)
    onChange(normalized.hoursText, normalized.minutesText)
  }

  const onStepHours = (delta: number) => {
    onChange(stepHoursText(hoursText, delta), minutesText)
  }

  const onStepMinutes = (delta: number) => {
    const normalized = applyMinutesDeltaWithCarry(hoursText, minutesText, delta)
    onChange(normalized.hoursText, normalized.minutesText)
  }

  return (
    <>
      <div className="fieldGroup">
        {showLabels && (
          <label className="fieldLabel" htmlFor={hoursInputId}>
            {hoursLabel}
          </label>
        )}
        <div className="assignmentHoursInputWrap">
          <input
            id={hoursInputId}
            className={hoursInputClassName}
            type="number"
            min="0"
            step="1"
            value={hoursText}
            onChange={(e) => onHoursChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                onStepHours(1)
                return
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault()
                onStepHours(-1)
              }
            }}
            placeholder={hoursPlaceholder}
            aria-label={hoursAriaLabel}
          />
          <div className="assignmentHoursStepButtons">
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="up"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepHours(1)}
              aria-label={increaseHoursLabel}
            />
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="down"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepHours(-1)}
              aria-label={decreaseHoursLabel}
            />
          </div>
        </div>
      </div>
      <div className="fieldGroup">
        {showLabels && (
          <label className="fieldLabel" htmlFor={minutesInputId}>
            {minutesLabel}
          </label>
        )}
        <div className="assignmentMinutesInputWrap">
          <input
            id={minutesInputId}
            className={minutesInputClassName}
            type="number"
            min="-60"
            step="1"
            value={minutesText}
            onChange={(e) => onMinutesChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                onStepMinutes(10)
                return
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault()
                onStepMinutes(-10)
              }
            }}
            placeholder={minutesPlaceholder}
            aria-label={minutesAriaLabel}
          />
          <div className="assignmentMinutesStepButtons">
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="up"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepMinutes(10)}
              aria-label={increaseMinutesLabel}
            />
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="down"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepMinutes(-10)}
              aria-label={decreaseMinutesLabel}
            />
          </div>
        </div>
      </div>
    </>
  )
}
