import { applyMinutesDeltaWithCarry, normalizeAssignmentTimeParts, stepHoursText } from '../utils/assignmentTime'

type TimePartsInputProps = {
  leftText: string
  rightText: string
  onChange: (nextLeftText: string, nextRightText: string) => void
  leftAriaLabel: string
  rightAriaLabel: string
  leftPlaceholder?: string
  rightPlaceholder?: string
  leftInputId?: string
  rightInputId?: string
  showLabels?: boolean
  leftLabel?: string
  rightLabel?: string
  leftInputClassName?: string
  rightInputClassName?: string
  increaseLeftLabel: string
  decreaseLeftLabel: string
  increaseRightLabel: string
  decreaseRightLabel: string
}

export function TimePartsInput({
  leftText,
  rightText,
  onChange,
  leftAriaLabel,
  rightAriaLabel,
  leftPlaceholder = 'Hours',
  rightPlaceholder = 'Minutes',
  leftInputId,
  rightInputId,
  showLabels = true,
  leftLabel = 'Hours',
  rightLabel = 'Minutes',
  leftInputClassName,
  rightInputClassName,
  increaseLeftLabel,
  decreaseLeftLabel,
  increaseRightLabel,
  decreaseRightLabel,
}: TimePartsInputProps) {
  const onHoursChange = (value: string) => {
    onChange(value, rightText)
  }

  const onMinutesChange = (value: string) => {
    const normalized = normalizeAssignmentTimeParts(leftText, value)
    onChange(normalized.hoursText, normalized.minutesText)
  }

  const onStepHours = (delta: number) => {
    onChange(stepHoursText(leftText, delta), rightText)
  }

  const onStepMinutes = (delta: number) => {
    const normalized = applyMinutesDeltaWithCarry(leftText, rightText, delta)
    onChange(normalized.hoursText, normalized.minutesText)
  }

  return (
    <>
      <div className="fieldGroup">
        {showLabels && (
          <label className="fieldLabel" htmlFor={leftInputId}>
            {leftLabel}
          </label>
        )}
        <div className="assignmentHoursInputWrap">
          <input
            id={leftInputId}
            className={leftInputClassName}
            type="number"
            min="0"
            step="1"
            value={leftText}
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
            placeholder={leftPlaceholder}
            aria-label={leftAriaLabel}
          />
          <div className="assignmentHoursStepButtons">
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="up"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepHours(1)}
              aria-label={increaseLeftLabel}
            />
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="down"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepHours(-1)}
              aria-label={decreaseLeftLabel}
            />
          </div>
        </div>
      </div>
      <div className="fieldGroup">
        {showLabels && (
          <label className="fieldLabel" htmlFor={rightInputId}>
            {rightLabel}
          </label>
        )}
        <div className="assignmentMinutesInputWrap">
          <input
            id={rightInputId}
            className={rightInputClassName}
            type="number"
            min="-60"
            step="1"
            value={rightText}
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
            placeholder={rightPlaceholder}
            aria-label={rightAriaLabel}
          />
          <div className="assignmentMinutesStepButtons">
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="up"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepMinutes(10)}
              aria-label={increaseRightLabel}
            />
            <button
              type="button"
              className="assignmentStepButton"
              data-dir="down"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStepMinutes(-10)}
              aria-label={decreaseRightLabel}
            />
          </div>
        </div>
      </div>
    </>
  )
}
