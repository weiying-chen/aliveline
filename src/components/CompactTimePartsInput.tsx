import { applyMinutesDeltaWithCarry, normalizeAssignmentTimeParts, stepHoursText } from '../utils/assignmentTime'

type CompactTimePartsInputProps = {
  leftText: string
  rightText: string
  onChange?: (nextLeftText: string, nextRightText: string) => void
  leftAriaLabel: string
  rightAriaLabel: string
  leftPlaceholder?: string
  rightPlaceholder?: string
  leftInputClassName?: string
  rightInputClassName?: string
  readOnly?: boolean
}

export function CompactTimePartsInput({
  leftText,
  rightText,
  onChange,
  leftAriaLabel,
  rightAriaLabel,
  leftPlaceholder = 'MM',
  rightPlaceholder = 'SS',
  leftInputClassName,
  rightInputClassName,
  readOnly = false,
}: CompactTimePartsInputProps) {
  const onLeftChange = (value: string) => {
    if (readOnly || !onChange) return
    onChange(value, rightText)
  }

  const onRightChange = (value: string) => {
    if (readOnly || !onChange) return
    const normalized = normalizeAssignmentTimeParts(leftText, value)
    onChange(normalized.hoursText, normalized.minutesText)
  }

  return (
    <div className="compactTimeParts" aria-label="Content length time input">
      <div className="compactTimePartInputWrap" data-part="left">
        <input
          className={leftInputClassName}
          type={readOnly ? 'text' : 'number'}
          min="0"
          step="1"
          value={leftText}
          readOnly={readOnly}
          onChange={(e) => onLeftChange(e.target.value)}
          onKeyDown={(event) => {
            if (readOnly || !onChange) return
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onChange(stepHoursText(leftText, 1), rightText)
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              onChange(stepHoursText(leftText, -1), rightText)
            }
          }}
          placeholder={leftPlaceholder}
          aria-label={leftAriaLabel}
        />
      </div>
      <span className="compactTimeColon" aria-hidden="true">:</span>
      <div className="compactTimePartInputWrap" data-part="right">
        <input
          className={rightInputClassName}
          type={readOnly ? 'text' : 'number'}
          min="-60"
          step="1"
          value={rightText}
          readOnly={readOnly}
          onChange={(e) => onRightChange(e.target.value)}
          onKeyDown={(event) => {
            if (readOnly || !onChange) return
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              const normalized = applyMinutesDeltaWithCarry(leftText, rightText, 10)
              onChange(normalized.hoursText, normalized.minutesText)
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              const normalized = applyMinutesDeltaWithCarry(leftText, rightText, -10)
              onChange(normalized.hoursText, normalized.minutesText)
            }
          }}
          placeholder={rightPlaceholder}
          aria-label={rightAriaLabel}
        />
      </div>
    </div>
  )
}
