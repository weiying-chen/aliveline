/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import App from './App'

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  )
}

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

function openAddAssignmentForm() {
  const toggle = screen.getByRole('button', { name: 'Toggle assignment form' })
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(toggle)
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

  it('extends main deadline when adding item entries', () => {
    const { container } = renderApp()
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    const deadlineTextBefore = container.querySelector('.deadline')?.textContent
    expect(deadlineTextBefore).toContain('2026-04-10')
    expect(deadlineTextBefore).toContain('1:00 PM')

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'English news + recording' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    const deadlineTextAfter = container.querySelector('.deadline')?.textContent
    expect(deadlineTextAfter).toContain('2:36 PM')
    expect(deadlineTextAfter).not.toBe(deadlineTextBefore)
  })

  it('shows deadline message with previous and updated deadline after adding item time', () => {
    const { container } = renderApp()
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Emily Ding' } })

    const preview = screen.getByLabelText('Deadline extension message preview')
    expect(preview.textContent).toBe(
      '今日做其他事時間是 1時36分\n\n' +
        '英文新聞+錄音 1時36分\n\n' +
        '3集大愛真健康，deadline由4/10（五）13:00，延後至4/10（五）14:36，請Emily Ding幫我確認，謝謝。'
    )
    expect(container.querySelector('.deadline')?.textContent).toContain('2:36 PM')
  })

  it('shows the same deadline message under unified model', () => {
    const { container } = renderApp()
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-10T12:00' } })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Emily Ding' } })

    const preview = screen.getByLabelText('Deadline extension message preview')
    expect(preview.textContent).toBe(
      '今日做其他事時間是 1時36分\n\n' +
        '英文新聞+錄音 1時36分\n\n' +
        '3集大愛真健康，deadline由4/10（五）13:00，延後至4/10（五）14:36，請Emily Ding幫我確認，謝謝。'
    )
    expect(container.querySelector('.deadline')?.textContent).toContain('2:36 PM')
  })

  it('shows the same item due time under unified model', () => {
    renderApp()
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'English news + recording' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    expect(screen.getAllByLabelText('Assignment due time display')[0].textContent).toContain('1h 36m')
  })

  it('snaps exact picked deadlines to work time', () => {
    renderApp()

    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })

    expect(screen.getByLabelText('Current deadline display').textContent).toContain('1:00 PM')
    expect((screen.getByLabelText('Deadline time') as HTMLInputElement).value).toBe('2026-04-10T13:00')
  })

  it('keeps planned work time at zero when unset', () => {
    renderApp()

    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })

    expect((screen.getByLabelText('Planned work hours') as HTMLInputElement).value).toBe('00')
    expect((screen.getByLabelText('Planned work minutes') as HTMLInputElement).value).toBe('00')
  })

  it('keeps assignment title when deadline changes', () => {
    renderApp()

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: 'Keep this title' },
    })
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })

    expect((screen.getByLabelText('Assignment title') as HTMLInputElement).value).toBe('Keep this title')
  })

  it('sets deadline from start plus adjusted duration', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start date + duration' }))
    fireEvent.change(screen.getByLabelText('Deadline start time'), {
      target: { value: '2026-04-10T12:00' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration hours'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration minutes'), {
      target: { value: '0' },
    })

    expect(screen.getByLabelText('Current deadline display').textContent).toContain('2:36 PM')
    expect(screen.queryByText(/Final due:/)).toBeNull()
  })

  it('snaps out-of-hours duration start to next work window', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start date + duration' }))
    fireEvent.change(screen.getByLabelText('Deadline start time'), {
      target: { value: '2026-04-09T19:00' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration hours'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration minutes'), {
      target: { value: '0' },
    })

    expect(screen.getByLabelText('Current deadline display').textContent).toContain('9:36 AM')
    expect((screen.getByLabelText('Deadline start time') as HTMLInputElement).value).toBe(
      '2026-04-10T08:00'
    )
    expect(screen.queryByText(/Start time adjusted to next work window:/)).toBeNull()
  })

  it('uses stepped duration minute controls with hour carry', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start date + duration' }))
    fireEvent.change(screen.getByLabelText('Deadline duration hours'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration minutes'), {
      target: { value: '1023' },
    })

    expect((screen.getByLabelText('Deadline duration hours') as HTMLInputElement).value).toBe('19')
    expect((screen.getByLabelText('Deadline duration minutes') as HTMLInputElement).value).toBe('3')

    fireEvent.click(screen.getByRole('button', { name: 'Increase deadline duration minutes by 10' }))
    expect((screen.getByLabelText('Deadline duration hours') as HTMLInputElement).value).toBe('19')
    expect((screen.getByLabelText('Deadline duration minutes') as HTMLInputElement).value).toBe('13')
  })

  it('keeps mode datetime inputs aligned to current deadline when switching modes', () => {
    renderApp()

    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T11:15' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start date + duration' }))
    expect((screen.getByLabelText('Deadline start time') as HTMLInputElement).value).toBe(
      '2026-04-10T11:15'
    )
    fireEvent.change(screen.getByLabelText('Deadline start time'), {
      target: { value: '2026-04-10T12:00' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration hours'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Deadline duration minutes'), {
      target: { value: '45' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pick exact date/time' }))
    expect((screen.getByLabelText('Deadline time') as HTMLInputElement).value).toBe('2026-04-10T14:24')

    fireEvent.click(screen.getByRole('button', { name: 'Start date + duration' }))
    expect((screen.getByLabelText('Deadline start time') as HTMLInputElement).value).toBe(
      '2026-04-10T14:24'
    )
    expect((screen.getByLabelText('Deadline duration hours') as HTMLInputElement).value).toBe('1')
    expect((screen.getByLabelText('Deadline duration minutes') as HTMLInputElement).value).toBe('45')
  })

  it('renders compact icon-only deadline mode toggle', () => {
    renderApp()

    expect(screen.queryByText('Pick exact date/time')).toBeNull()
    expect(screen.queryByText('Start date + duration')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pick exact date/time' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start date + duration' })).toBeTruthy()
  })

  it('uses 0.8 work time in deadline extension preview content', () => {
    renderApp()
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2099-04-10T12:00' } })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '小編文' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: '3集大愛真健康' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Emily Ding' } })

    const preview = screen.getByLabelText('Deadline extension message preview')
    expect(preview.textContent).toContain('今日做其他事時間是 1時36分')
    expect(preview.textContent).toContain('小編文 1時36分')
  })

  it('shows next assignment message preview from latest affecting deadline context', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T13:00:00'))
    renderApp()
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T13:00' },
    })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: '仁心慧語 (呂紹睿)' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Emily Ding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next assignment message' }))

    const preview = screen.getByLabelText('Next assignment message preview')
    expect(preview.textContent).toBe(
      '已完成英文新聞+錄音，接下來會開始翻譯仁心慧語 (呂紹睿)，再麻煩Emily Ding便時幫忙設deadline，從4/10（五）14:36起算，謝謝。\n=====\n之前是1分鐘算1小時，現在改成1分鐘算0.8 小時，謝謝。'
    )
  })

  it('shows next assignment message from current affecting deadline without copied history', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T13:00:00'))
    renderApp()

    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T13:00' },
    })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '英文新聞+錄音' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: '仁心慧語 (呂紹睿)' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Emily Ding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next assignment message' }))

    const preview = screen.getByLabelText('Next assignment message preview')
    expect(preview.textContent).toBe(
      '已完成英文新聞+錄音，接下來會開始翻譯仁心慧語 (呂紹睿)，再麻煩Emily Ding便時幫忙設deadline，從4/10（五）14:36起算，謝謝。\n=====\n之前是1分鐘算1小時，現在改成1分鐘算0.8 小時，謝謝。'
    )
  })

  it('uses the same 10-minute rounding as item time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    renderApp()

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T10:20' } })

    const remaining = readHoursMinutes('Remaining work time display')
    expect(remaining).toEqual({ hours: 0, minutes: 20 })
  })

  it('keeps deadline unchanged when assignments are added later', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    renderApp()

    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement
    fireEvent.change(deadlineInput, { target: { value: '2026-04-15T13:00' } })

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000)
    })

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Late added item' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    const displayDeadline = screen.getByLabelText('Current deadline display').textContent ?? ''
    expect(displayDeadline).toContain('2:36 PM')
  })

  it('focuses deadline input when clicking deadline or remaining display', () => {
    const { container } = renderApp()
    const deadlineInput = screen.getByLabelText('Deadline time') as HTMLInputElement

    const deadlineDisplay = container.querySelector('.deadline')
    const remainingDisplay = container.querySelector('.remaining')
    if (!deadlineDisplay || !remainingDisplay) {
      throw new Error('Expected deadline and remaining display elements')
    }

    fireEvent.click(deadlineDisplay)
    expect(document.activeElement).toBe(deadlineInput)

    deadlineInput.blur()
    fireEvent.click(remainingDisplay)
    expect(document.activeElement).toBe(deadlineInput)

    fireEvent.click(screen.getByRole('button', { name: 'Start date + duration' }))
    const durationStartInput = screen.getByLabelText('Deadline start time') as HTMLInputElement

    durationStartInput.blur()
    fireEvent.click(deadlineDisplay)
    expect(document.activeElement).toBe(durationStartInput)

    durationStartInput.blur()
    fireEvent.click(remainingDisplay)
    expect(document.activeElement).toBe(durationStartInput)
  })

  it('renders assignment history export as an accordion panel', () => {
    renderApp()

    const header = screen.getByRole('button', { name: 'Assignment history export' })
    expect(header.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows a month label in assignment history export', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))
    expect(screen.getByLabelText('Month')).toBeTruthy()
  })

  it('shows JSON export only in assignment history export', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
    expect(screen.getByRole('button', { name: /export json/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /import json/i })).toBeTruthy()
  })

  it('exports raw assignment state from local storage as-is', async () => {
    let exportedBlob: Blob | MediaSource | null = null
    Object.assign(URL, {
      createObjectURL: () => 'blob:stub',
      revokeObjectURL: () => {},
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      exportedBlob = blob
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const state = {
      assignments: [
        {
          id: 'legacy-root',
          title: 'Assignment',
          deadline: '2026-05-02T02:48:00.000Z',
          relations: [{ assignmentId: 'assignment-a', type: 'extends' }],
          comments: [],
        },
        {
          id: 'assignment-a',
          title: 'Visible assignment',
          deadline: '2026-05-02T02:48:00.000Z',
          relations: [],
          comments: [],
        },
      ],
    }
    localStorage.setItem('aliveline:assignments', JSON.stringify(state))

    render(
      <MemoryRouter>
        <App selectedAssignmentId="legacy-root" persistAssignments={false} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))
    fireEvent.click(screen.getByRole('button', { name: /export json/i }))

    if (!exportedBlob || typeof exportedBlob !== 'object' || !('text' in exportedBlob)) {
      throw new Error('Expected export blob')
    }
    const content = await (exportedBlob as Blob).text()
    const parsed = JSON.parse(content)
    expect(parsed).toEqual({
      assignments: state.assignments,
      exportMonth: `${new Date().getFullYear()}-${`${new Date().getMonth() + 1}`.padStart(2, '0')}`,
    })
  })

  it('imports assignment state JSON and refreshes assignment state', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))
    const importInput = screen.getByLabelText('Import assignment JSON') as HTMLInputElement
    const imported = {
      assignments: [
        {
          id: 'imported-assignment',
          title: 'Imported assignment',
          deadline: '2026-04-10T12:00:00.000Z',
          contentMinutes: 18,
          comments: [],
          children: [
            {
              id: 'imported-item-0',
              title: 'Imported item',
              deadline: '2026-04-10T12:00:00.000Z',
              comments: [],
              workMinutes: 50,
              children: [],
            },
          ],
        },
      ],
    }

    const file = new File([JSON.stringify(imported)], 'assignments.json', {
      type: 'application/json',
    })
    fireEvent.change(importInput, { target: { files: [file] } })

    await waitFor(() => {
      expect((screen.getByLabelText('Assignment title') as HTMLInputElement).value).toBe(
        'Imported assignment'
      )
    })
    expect(screen.getByLabelText('Current deadline display').textContent).toContain('2026-04-10')
    expect(screen.getAllByLabelText('Assignment due time display')[0].textContent).toContain('40m')
    expect((screen.getByLabelText('Content length minutes') as HTMLInputElement).value).toBe('18')
    expect((screen.getByLabelText('Content length seconds') as HTMLInputElement).value).toBe('00')
    expect(screen.getByLabelText('Import assignment status').textContent).toBe('Imported.')
  })

  it('derives content minutes from imported content seconds when minutes is missing', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))
    const importInput = screen.getByLabelText('Import assignment JSON') as HTMLInputElement
    const imported = {
      assignments: [
        {
          id: 'imported-seconds-only',
          title: 'Imported assignment',
          deadline: '2026-04-10T12:00:00.000Z',
          contentSeconds: 210,
          comments: [],
          children: [],
        },
      ],
    }

    const file = new File([JSON.stringify(imported)], 'assignments-seconds.json', {
      type: 'application/json',
    })
    fireEvent.change(importInput, { target: { files: [file] } })

    await waitFor(() => {
      expect((screen.getByLabelText('Content length minutes') as HTMLInputElement).value).toBe('3')
    })
    expect((screen.getByLabelText('Content length seconds') as HTMLInputElement).value).toBe('30')
  })

  it('uses shared muted meta text style for counting and history summary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T06:00:00'))
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Assignment history export' }))

    expect(screen.getByText(/Counting from/).classList.contains('metaTextMutedSm')).toBe(true)
    expect(screen.getByText(/assignments, .* hours/).classList.contains('metaTextMutedSm')).toBe(
      true
    )
  })

  it('does not store assignment history when copying messages', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWrite,
      },
    })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Deadline extension message' }))
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })
    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Assignment A' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))
    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: 'Main assignment' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Emily Ding' } })

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(localStorage.getItem('aliveline:assignment-history')).toBeNull()
    })
  })

  it('boots from assignment state storage', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = `${now.getMonth() + 1}`.padStart(2, '0')
    const d = `${now.getDate()}`.padStart(2, '0')
    localStorage.setItem('aliveline:daily-clear', `${y}-${m}-${d}`)
    localStorage.setItem(
      'aliveline:assignments',
      JSON.stringify({
        assignments: [
          {
            id: 'boot-assignment',
            title: 'Boot assignment',
            deadline: '2026-04-10T12:00:00.000Z',
            comments: [],
            children: [
              {
                id: 'boot-item-0',
                title: 'Boot item',
                deadline: '2026-04-10T12:00:00.000Z',
                comments: [],
                workMinutes: 50,
                children: [],
              },
            ],
          },
        ],
      })
    )

    renderApp()

    expect(screen.getByLabelText('Current deadline display').textContent).toContain('2026-04-10')
    expect(screen.getAllByLabelText('Assignment due time display')[0].textContent).toContain('40m')

    expect((screen.getByLabelText('Assignment title') as HTMLInputElement).value).toBe('Boot assignment')
  })

  it('edits assignment title inline from main card', () => {
    renderApp()

    const titleInput = screen.getByLabelText('Assignment title') as HTMLInputElement
    expect(titleInput.value).toBe('')
    expect(titleInput.placeholder).toBe('Assignment')

    fireEvent.change(titleInput, { target: { value: 'Research Project' } })

    expect((screen.getByLabelText('Assignment title') as HTMLInputElement).value).toBe(
      'Research Project'
    )
    expect((screen.getByLabelText('Assignment title') as HTMLInputElement).value).toBe('Research Project')
  })

  it('updates assignment state assignments when list changes', () => {
    renderApp()
    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-10T12:00' },
    })
    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: 'Assignment mutation assignment' },
    })
    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Assignment A' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    let state = JSON.parse(localStorage.getItem('aliveline:assignments') ?? '{}')
    expect(Array.isArray(state.assignments)).toBe(true)
    const firstAssignment = state.assignments[0]?.children?.[0]
    expect(firstAssignment?.title).toBe('Assignment A')
    expect(firstAssignment?.workMinutes).toBe(80)

    fireEvent.click(screen.getByRole('button', { name: 'Remove assignment' }))
    state = JSON.parse(localStorage.getItem('aliveline:assignments') ?? '{}')
    expect(state.assignments[0]?.children ?? []).toEqual([])
  })

  it('keeps root workMinutes frozen after affecting assignments change deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:00:00'))
    renderApp()

    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-15T13:00' },
    })

    let state = JSON.parse(localStorage.getItem('aliveline:assignments') ?? '{}')
    expect(state.assignments[0]?.workMinutes).toBe(120)

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Assignment A' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    state = JSON.parse(localStorage.getItem('aliveline:assignments') ?? '{}')
    expect(state.assignments[0]?.workMinutes).toBe(120)
  })

  it('captures root workMinutes from previous assignment deadline to current deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    localStorage.setItem(
      'aliveline:assignments',
      JSON.stringify({
        assignments: [
          {
            id: 'assignment-current',
            title: 'Current assignment',
            deadline: '2026-04-15T10:00:00.000Z',
            comments: [],
            children: [],
          },
          {
            id: 'assignment-previous',
            title: 'Previous assignment',
            deadline: '2026-04-15T00:00:00.000Z',
            comments: [],
            children: [],
          },
        ],
      })
    )

    render(
      <MemoryRouter>
        <App selectedAssignmentId="assignment-current" showTopNav={false} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Deadline time'), {
      target: { value: '2026-04-15T14:00' },
    })

    const state = JSON.parse(localStorage.getItem('aliveline:assignments') ?? '{}')
    const current = state.assignments.find((item: { id: string }) => item.id === 'assignment-current')
    expect(current.workMinutes).toBe(300)
    expect((screen.getByLabelText('Planned work hours') as HTMLInputElement).value).toBe('05')
    expect((screen.getByLabelText('Planned work minutes') as HTMLInputElement).value).toBe('00')
  })

  it('uses per-entry adjusted minutes consistently for consumed deadline updates', () => {
    localStorage.setItem(
      'aliveline:assignments',
      JSON.stringify({
        assignments: [
          {
            id: 'assignment-current',
            title: 'Current assignment',
            deadline: '2026-04-15T13:00:00.000Z',
            comments: [],
            children: [
              {
                id: 'assignment-current-item-0',
                title: 'Small item A',
                deadline: '2026-04-15T13:00:00.000Z',
                workMinutes: 2,
                comments: [],
                children: [],
              },
              {
                id: 'assignment-current-item-1',
                title: 'Small item B',
                deadline: '2026-04-15T13:00:00.000Z',
                workMinutes: 2,
                comments: [],
                children: [],
              },
            ],
          },
        ],
      })
    )

    render(
      <MemoryRouter>
        <App selectedAssignmentId="assignment-current" showTopNav={false} />
      </MemoryRouter>
    )

    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Regular item' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    expect(screen.getByLabelText('Current deadline display').textContent).toContain('8:12 AM')
  })

  it('persists selected assignment edits to assignment storage', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = `${now.getMonth() + 1}`.padStart(2, '0')
    const d = `${now.getDate()}`.padStart(2, '0')
    localStorage.setItem('aliveline:daily-clear', `${y}-${m}-${d}`)
    localStorage.setItem(
      'aliveline:assignments',
      JSON.stringify({
        assignments: [
          {
            id: 'assignment-a',
            title: 'Child assignment',
            deadline: '2026-04-10T12:00:00.000Z',
            comments: [],
            children: [],
          },
        ],
      })
    )

    render(
      <MemoryRouter>
        <App selectedAssignmentId="assignment-a" showTopNav={false} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: 'Edited child assignment' },
    })
    fireEvent.change(screen.getByLabelText('Owner'), {
      target: { value: 'Alice' },
    })
    fireEvent.change(screen.getByLabelText('Content length minutes'), {
      target: { value: '23' },
    })
    fireEvent.change(screen.getByLabelText('Content length seconds'), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle comment form' }))
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'Use simpler wording in paragraph 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nested assignment' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    const state = JSON.parse(localStorage.getItem('aliveline:assignments') ?? '{}')
    const edited = state.assignments.find((item: { id: string }) => item.id === 'assignment-a')
    expect(edited.title).toBe('Edited child assignment')
    expect(edited.owner).toBe('Alice')
    expect(edited.contentMinutes).toBe(24)
    expect(edited.contentSeconds).toBe(1410)
    expect(Array.isArray(edited.children)).toBe(true)
    expect(edited.children).toHaveLength(1)
    expect(edited.comments).toEqual(['Use simpler wording in paragraph 2'])

    const nested = edited.children[0]
    expect(nested.title).toBe('Nested assignment')
    expect(nested.workMinutes).toBe(60)
  })

  it('does not persist legacy v1 assignment keys', () => {
    renderApp()
    fireEvent.change(screen.getByLabelText('Assignment title'), {
      target: { value: 'Legacy key check' },
    })
    openAddAssignmentForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Assignment A' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /add assignment/i }))

    expect(localStorage.getItem('aliveline:deadline-extension-assignment')).toBeNull()
    expect(localStorage.getItem('aliveline:assignments')).toBeTruthy()
  })

  it('ignores malformed assignment key payload', () => {
    localStorage.setItem('aliveline:assignments', '{"deadline":123}')
    localStorage.setItem('aliveline:daily-clear', new Date().toISOString().slice(0, 10))

    renderApp()
    expect(screen.queryAllByLabelText('Assignment due time display')).toHaveLength(0)
    expect((screen.getByLabelText('Assignment title') as HTMLInputElement).value).toBe('')
  })

})
