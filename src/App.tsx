import { useEffect, useMemo, useRef, useState } from 'react'

import { formatDuration, formatTeamsMessage, type TaskEntry } from './utils/deadlineHistory'
import { formatStatusMessage } from './utils/statusMessage'
import {
  fmtDateTimeWithWeekday,
  fmtTime,
  msToParts,
  pad2,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from './utils/time'
import { updateRecentTaskNames } from './utils/taskHistory'
import { minutesFromTimeParts } from './utils/taskTime'
import {
  addWorkMinutes,
  atLocalTime,
  isInWorkTime,
  nextWorkStart,
  shouldShowEarlyFinishReminder,
  shouldShowTeamsReminder,
  workMsBetween,
  WORK_BLOCKS,
} from './utils/workTime'

type PickerInput = HTMLInputElement

const LS_DEADLINE_KEY = 'aliveline:deadline-iso'
const LS_PREV_DEADLINE_KEY = 'aliveline:previous-deadline-iso'
const LS_PREV_CHANGED_KEY = 'aliveline:previous-deadline-changed-iso'
const LS_PREV_TASKS_KEY = 'aliveline:previous-tasks'
const LS_TASKS_KEY = 'aliveline:tasks'
const LS_RECENT_TASKS_KEY = 'aliveline:recent-tasks'
const LS_CHANGE_BASE_KEY = 'aliveline:change-base-deadline-iso'
const LS_MESSAGE_ASSIGNMENT_KEY = 'aliveline:message-assignment'
const LS_MESSAGE_ASSIGNEE_KEY = 'aliveline:message-assignee'
const LS_STATUS_COMPLETED_ASSIGNMENT_KEY = 'aliveline:status-completed-assignment'
const LS_STATUS_NEXT_ASSIGNMENT_KEY = 'aliveline:status-next-assignment'
const LS_STATUS_ASSIGNEE_KEY = 'aliveline:status-assignee'
const LS_STATUS_START_KEY = 'aliveline:status-start-iso'
const LS_PANEL_TASKS_OPEN_KEY = 'aliveline:panel-tasks-open'
const LS_PANEL_STATUS_OPEN_KEY = 'aliveline:panel-status-open'
const LS_DAILY_CLEAR_KEY = 'aliveline:daily-clear'
const LS_REMINDER_NOTIFIED_KEY = 'aliveline:reminder-notified'
const LS_REMINDER_REQUESTED_KEY = 'aliveline:reminder-requested'
const LS_TEAMS_REMINDER_NOTIFIED_KEY = 'aliveline:teams-reminder-notified'
const LS_TEAMS_REMINDER_REQUESTED_KEY = 'aliveline:teams-reminder-requested'

function readStoredDate(key: string) {
  const saved = localStorage.getItem(key)
  if (!saved) return null
  const d = new Date(saved)
  return Number.isNaN(d.getTime()) ? null : d
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function readStoredEntries(key: string) {
  const saved = localStorage.getItem(key)
  if (!saved) return [] as TaskEntry[]
  try {
    const parsed = JSON.parse(saved) as TaskEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) => typeof item?.text === 'string' && Number.isFinite(item?.minutes) && item.minutes > 0
    )
  } catch {
    return []
  }
}

function readStoredStringList(key: string) {
  const saved = localStorage.getItem(key)
  if (!saved) return [] as string[]
  try {
    const parsed = JSON.parse(saved) as string[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function readStoredBool(key: string, fallback: boolean) {
  const saved = localStorage.getItem(key)
  if (saved === null) return fallback
  return saved === 'true'
}

export default function App() {
  const deadlineRef = useRef<PickerInput | null>(null)

  const [now, setNow] = useState(() => new Date())
  const [deadline, setDeadline] = useState(() => readStoredDate(LS_DEADLINE_KEY) ?? new Date())
  const [previousDeadline, setPreviousDeadline] = useState<Date | null>(() =>
    readStoredDate(LS_PREV_DEADLINE_KEY)
  )
  const [previousChangedAt, setPreviousChangedAt] = useState<Date | null>(() =>
    readStoredDate(LS_PREV_CHANGED_KEY)
  )
  const [previousTasks, setPreviousTasks] = useState<TaskEntry[]>(() =>
    readStoredEntries(LS_PREV_TASKS_KEY)
  )
  const [tasks, setTasks] = useState<TaskEntry[]>(() =>
    readStoredEntries(LS_TASKS_KEY)
  )
  const [recentTasks, setRecentTasks] = useState<string[]>(() =>
    readStoredStringList(LS_RECENT_TASKS_KEY)
  )
  const [changeBaseDeadline, setChangeBaseDeadline] = useState<Date | null>(() =>
    readStoredDate(LS_CHANGE_BASE_KEY)
  )
  const [taskText, setTaskText] = useState('')
  const [taskHours, setTaskHours] = useState('')
  const [taskMinutes, setTaskMinutes] = useState('')
  const [isRecentOpen, setIsRecentOpen] = useState(false)
  const [recentActiveIndex, setRecentActiveIndex] = useState<number>(-1)
  const [messageAssignment, setMessageAssignment] = useState(
    () => localStorage.getItem(LS_MESSAGE_ASSIGNMENT_KEY) ?? ''
  )
  const [messageAssignee, setMessageAssignee] = useState(
    () => localStorage.getItem(LS_MESSAGE_ASSIGNEE_KEY) ?? ''
  )
  const [statusCompletedAssignment, setStatusCompletedAssignment] = useState(
    () => localStorage.getItem(LS_STATUS_COMPLETED_ASSIGNMENT_KEY) ?? ''
  )
  const [statusNextAssignment, setStatusNextAssignment] = useState(
    () => localStorage.getItem(LS_STATUS_NEXT_ASSIGNMENT_KEY) ?? ''
  )
  const [statusAssignee, setStatusAssignee] = useState(
    () => localStorage.getItem(LS_STATUS_ASSIGNEE_KEY) ?? ''
  )
  const [statusStartAt, setStatusStartAt] = useState<Date | null>(
    () => readStoredDate(LS_STATUS_START_KEY)
  )
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [statusCopyStatus, setStatusCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_TASKS_OPEN_KEY, false)
  )
  const [isStatusPanelOpen, setIsStatusPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_STATUS_OPEN_KEY, false)
  )

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const current = new Date()
    const dayStart = new Date(current)
    dayStart.setHours(0, 0, 0, 0)
    const firstBlock = WORK_BLOCKS[0]
    const lastBlock = WORK_BLOCKS[WORK_BLOCKS.length - 1]
    const reminderStart = atLocalTime(dayStart, firstBlock.start)
    const reminderEnd = new Date(reminderStart)
    reminderEnd.setMinutes(reminderEnd.getMinutes() + 60)
    const cutoff = atLocalTime(dayStart, lastBlock.end)
    const firedKey = localStorage.getItem(LS_REMINDER_NOTIFIED_KEY)
    console.log(
      `[reminder] window ${fmtTime(reminderStart)}–${fmtTime(reminderEnd)}; cutoff ${fmtTime(cutoff)}; fired ${firedKey === dateKey(current) ? 'yes' : 'no'}`
    )
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_DEADLINE_KEY, deadline.toISOString())
  }, [deadline])

  useEffect(() => {
    if (previousDeadline) {
      localStorage.setItem(LS_PREV_DEADLINE_KEY, previousDeadline.toISOString())
    }
  }, [previousDeadline])

  useEffect(() => {
    if (previousChangedAt) {
      localStorage.setItem(LS_PREV_CHANGED_KEY, previousChangedAt.toISOString())
    }
  }, [previousChangedAt])

  useEffect(() => {
    localStorage.setItem(LS_PREV_TASKS_KEY, JSON.stringify(previousTasks))
  }, [previousTasks])

  useEffect(() => {
    localStorage.setItem(LS_TASKS_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem(LS_RECENT_TASKS_KEY, JSON.stringify(recentTasks))
  }, [recentTasks])

  useEffect(() => {
    if (changeBaseDeadline) {
      localStorage.setItem(LS_CHANGE_BASE_KEY, changeBaseDeadline.toISOString())
    } else {
      localStorage.removeItem(LS_CHANGE_BASE_KEY)
    }
  }, [changeBaseDeadline])

  useEffect(() => {
    localStorage.setItem(LS_MESSAGE_ASSIGNMENT_KEY, messageAssignment)
  }, [messageAssignment])

  useEffect(() => {
    const todayKey = dateKey(now)
    const savedKey = localStorage.getItem(LS_DAILY_CLEAR_KEY)
    if (savedKey === todayKey) return

    const cutoff = new Date(now)
    cutoff.setHours(17, 0, 0, 0)
    if (!savedKey && now.getTime() < cutoff.getTime()) return

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayKey = dateKey(yesterday)

    if (now.getTime() < cutoff.getTime() && savedKey === yesterdayKey) return

    localStorage.setItem(
      LS_DAILY_CLEAR_KEY,
      now.getTime() >= cutoff.getTime() ? todayKey : yesterdayKey
    )
    setTasks([])
    setTaskText('')
    setTaskHours('')
    setTaskMinutes('')
    setChangeBaseDeadline(null)
    setPreviousTasks([])
    setMessageAssignment('')
    setMessageAssignee('')
  }, [now])

  const workMsLeft = useMemo(() => workMsBetween(now, deadline), [now, deadline])
  const parts = useMemo(() => msToParts(workMsLeft), [workMsLeft])
  const workStartAt = useMemo(() => (isInWorkTime(now) ? now : nextWorkStart(now)), [now])
  const showEarlyFinishReminder = useMemo(
    () => shouldShowEarlyFinishReminder(now, deadline),
    [deadline, now]
  )
  const showTeamsReminder = useMemo(
    () => shouldShowTeamsReminder(now, deadline),
    [deadline, now]
  )

  useEffect(() => {
    if (!showEarlyFinishReminder) return
    if (typeof Notification === 'undefined') return

    const todayKey = dateKey(now)
    const notifiedKey = localStorage.getItem(LS_REMINDER_NOTIFIED_KEY)
    const requestedKey = localStorage.getItem(LS_REMINDER_REQUESTED_KEY)
    console.log(
      `[reminder] permission ${Notification.permission}; requested ${requestedKey === todayKey ? 'yes' : 'no'}; notified ${notifiedKey === todayKey ? 'yes' : 'no'}`
    )
    if (notifiedKey === todayKey) return

    const sendNotification = () => {
      new Notification('Reminder', {
        body: 'Ask for more work before 9:00 AM.',
      })
      localStorage.setItem(LS_REMINDER_NOTIFIED_KEY, todayKey)
    }

    if (Notification.permission === 'granted') {
      sendNotification()
      return
    }

    if (Notification.permission === 'denied') return

    if (requestedKey === todayKey) return
    localStorage.setItem(LS_REMINDER_REQUESTED_KEY, todayKey)

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') sendNotification()
    })
  }, [deadline, now, showEarlyFinishReminder])

  useEffect(() => {
    if (!showTeamsReminder) return
    if (typeof Notification === 'undefined') return

    const todayKey = dateKey(now)
    if (localStorage.getItem(LS_TEAMS_REMINDER_NOTIFIED_KEY) === todayKey) return

    const sendNotification = () => {
      new Notification('Reminder', {
        body: 'Post the Teams update.',
      })
      localStorage.setItem(LS_TEAMS_REMINDER_NOTIFIED_KEY, todayKey)
    }

    if (Notification.permission === 'granted') {
      sendNotification()
      return
    }

    if (Notification.permission === 'denied') return

    if (localStorage.getItem(LS_TEAMS_REMINDER_REQUESTED_KEY) === todayKey) return
    localStorage.setItem(LS_TEAMS_REMINDER_REQUESTED_KEY, todayKey)

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') sendNotification()
    })
  }, [deadline, now, showTeamsReminder])

  useEffect(() => {
    localStorage.setItem(LS_MESSAGE_ASSIGNEE_KEY, messageAssignee)
  }, [messageAssignee])

  useEffect(() => {
    localStorage.setItem(LS_STATUS_COMPLETED_ASSIGNMENT_KEY, statusCompletedAssignment)
  }, [statusCompletedAssignment])

  useEffect(() => {
    localStorage.setItem(LS_STATUS_NEXT_ASSIGNMENT_KEY, statusNextAssignment)
  }, [statusNextAssignment])

  useEffect(() => {
    localStorage.setItem(LS_STATUS_ASSIGNEE_KEY, statusAssignee)
  }, [statusAssignee])

  useEffect(() => {
    localStorage.setItem(LS_PANEL_TASKS_OPEN_KEY, String(isTasksPanelOpen))
  }, [isTasksPanelOpen])

  useEffect(() => {
    localStorage.setItem(LS_PANEL_STATUS_OPEN_KEY, String(isStatusPanelOpen))
  }, [isStatusPanelOpen])

  useEffect(() => {
    if (statusStartAt) {
      localStorage.setItem(LS_STATUS_START_KEY, statusStartAt.toISOString())
    } else {
      localStorage.removeItem(LS_STATUS_START_KEY)
    }
  }, [statusStartAt])

  const updateDeadline = (
    nextDeadline: Date,
    options?: { tasks?: TaskEntry[]; resetDrafts?: boolean }
  ) => {
    if (nextDeadline.getTime() === deadline.getTime()) return
    setPreviousDeadline(deadline)
    setPreviousChangedAt(new Date())
    setPreviousTasks(options?.tasks ?? [])
    setDeadline(nextDeadline)
    if (options?.resetDrafts) {
      setTasks([])
      setChangeBaseDeadline(null)
    }
  }

  const onSetDeadline = (v: string) => {
    const d = parseDatetimeLocalValue(v)
    if (d) updateDeadline(d, { resetDrafts: true })
  }

  const reset = () => {
    updateDeadline(new Date(), { resetDrafts: true })
  }

  const teamsMessage = useMemo(() => {
    if (!previousDeadline) return ''
    if (!messageAssignment.trim()) return ''
    if (!messageAssignee.trim()) return ''
    if (tasks.length === 0) return ''
    return formatTeamsMessage({
      previous: previousDeadline,
      next: deadline,
      tasks: tasks.length > 0 ? tasks : previousTasks,
      assignment: messageAssignment,
      assignee: messageAssignee,
    })
  }, [deadline, messageAssignee, messageAssignment, previousDeadline, previousTasks, tasks])

  const filteredRecentTaskItems = useMemo(() => {
    const needle = taskText.trim().toLowerCase()
    if (!needle) return recentTasks
    return recentTasks.filter((item) => item.toLowerCase().includes(needle))
  }, [recentTasks, taskText])

  useEffect(() => {
    setRecentActiveIndex(filteredRecentTaskItems.length > 0 ? 0 : -1)
  }, [filteredRecentTaskItems])

  useEffect(() => {
    setCopyStatus('idle')
  }, [teamsMessage])

  const statusMessage = useMemo(() => {
    if (!statusStartAt) return ''
    if (!statusCompletedAssignment.trim()) return ''
    if (!statusNextAssignment.trim()) return ''
    if (!statusAssignee.trim()) return ''
    return formatStatusMessage({
      completedAssignment: statusCompletedAssignment,
      nextAssignment: statusNextAssignment,
      assignee: statusAssignee,
      start: statusStartAt,
      deadline,
    })
  }, [
    deadline,
    statusAssignee,
    statusCompletedAssignment,
    statusNextAssignment,
    statusStartAt,
  ])

  useEffect(() => {
    setStatusCopyStatus('idle')
  }, [statusMessage])

  const onCopyTeamsMessage = async () => {
    if (!teamsMessage) return
    try {
      await navigator.clipboard.writeText(teamsMessage)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  const onCopyStatusMessage = async () => {
    if (!statusMessage) return
    try {
      await navigator.clipboard.writeText(statusMessage)
      setStatusCopyStatus('copied')
    } catch {
      setStatusCopyStatus('failed')
    }
  }

  const addTaskEntry = () => {
    const minutes = minutesFromTimeParts(taskHours, taskMinutes)
    if (!taskText.trim() || minutes === null) return
    const entry: TaskEntry = {
      text: taskText.trim(),
      minutes: Math.round(minutes),
    }
    setRecentTasks((prev) => updateRecentTaskNames(prev, entry.text))
    const nextTasks = [...tasks, entry]
    const baseDeadline = changeBaseDeadline ?? deadline
    if (!changeBaseDeadline) {
      setPreviousDeadline(deadline)
      setPreviousChangedAt(new Date())
      setChangeBaseDeadline(deadline)
    }
    setTasks(nextTasks)
    setPreviousTasks(nextTasks)
    setDeadline(addWorkMinutes(baseDeadline, nextTasks.reduce((sum, item) => sum + item.minutes, 0)))
    setTaskText('')
    setTaskHours('')
    setTaskMinutes('')
  }

  const removeTaskEntry = (index: number) => {
    const nextTasks = tasks.filter((_, i) => i !== index)
    setTasks(nextTasks)
    setPreviousTasks(nextTasks)
    if (changeBaseDeadline) {
      setDeadline(
        addWorkMinutes(changeBaseDeadline, nextTasks.reduce((sum, item) => sum + item.minutes, 0))
      )
    }
  }

  return (
    <div className="app">
      <div className="main">
        <div className="block">
          <div className="label">Previous deadline</div>
          <div className="previous">
            {previousDeadline ? fmtDateTimeWithWeekday(previousDeadline) : '—'}
          </div>
        </div>

        <div className="block">
          <div className="label">Deadline</div>
          <div className="deadline">{fmtDateTimeWithWeekday(deadline)}</div>
        </div>

        <div className="block">
          <div className="label">Remaining (work time)</div>
          <div className="remaining">
            {parts.days > 0 && `${parts.days}d `}
            {parts.hours}h {parts.minutes}m {parts.seconds}s
          </div>
        </div>
        {showEarlyFinishReminder && (
          <div className="reminder">Reminder: ask for more work before 9:00 AM.</div>
        )}
        {showTeamsReminder && <div className="reminder">Reminder: post the Teams update.</div>}
        {!isInWorkTime(now) && (
          <div className="overdue">Counting from {fmtDateTimeWithWeekday(workStartAt)}.</div>
        )}
      </div>

      <div className="controls">
        <input
          ref={deadlineRef}
          className="deadlineInput"
          type="datetime-local"
          value={toDatetimeLocalValue(deadline)}
          onChange={(e) => onSetDeadline(e.target.value)}
          aria-label="Deadline time"
        />

        <button
          onClick={reset}
          className="resetButton btn-secondary"
          aria-label="Reset deadline to now"
        >
          Reset
        </button>
      </div>

      <div className="message" data-state={isTasksPanelOpen ? 'open' : 'closed'}>
          <button
            type="button"
            className="messageHeader"
            onClick={() => setIsTasksPanelOpen((prev) => !prev)}
            aria-expanded={isTasksPanelOpen}
            aria-controls="tasks-panel"
          >
            <span className="messageTitle">Deadline extension message</span>
          </button>
          <div
            id="tasks-panel"
            className="messagePanel"
            data-state={isTasksPanelOpen ? 'open' : 'closed'}
            aria-hidden={!isTasksPanelOpen}
          >
            <div className="messagePanelInner">
              <fieldset disabled={!isTasksPanelOpen} className="messageFieldset">
                <div className="messageBody">
                  <div className="messageFields">
                    <input
                      type="text"
                      value={messageAssignment}
                      onChange={(e) => setMessageAssignment(e.target.value)}
                      placeholder="Assignment"
                      aria-label="Assignment name"
                    />
                    <input
                      type="text"
                      value={messageAssignee}
                      onChange={(e) => setMessageAssignee(e.target.value)}
                      placeholder="Confirm by"
                      aria-label="Confirm by"
                    />
                  </div>

                  <div className="taskFields">
                    <div className="taskInputWrap">
                      <input
                        type="text"
                        value={taskText}
                        onChange={(e) => setTaskText(e.target.value)}
                        onFocus={() => setIsRecentOpen(true)}
                        onBlur={() => setIsRecentOpen(false)}
                        onKeyDown={(event) => {
                          if (!isRecentOpen || filteredRecentTaskItems.length === 0) return
                          if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            setRecentActiveIndex((current) =>
                              current < filteredRecentTaskItems.length - 1 ? current + 1 : 0
                            )
                          } else if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            setRecentActiveIndex((current) =>
                              current > 0 ? current - 1 : filteredRecentTaskItems.length - 1
                            )
                          } else if (event.key === 'Enter') {
                            if (recentActiveIndex < 0) return
                            event.preventDefault()
                            const picked = filteredRecentTaskItems[recentActiveIndex]
                            if (!picked) return
                            setTaskText(picked)
                            setIsRecentOpen(false)
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            setIsRecentOpen(false)
                          }
                        }}
                        placeholder="Task item"
                        aria-label="Task item"
                        aria-expanded={isRecentOpen && filteredRecentTaskItems.length > 0}
                        aria-controls="task-recent-list"
                      />
                      {isRecentOpen && filteredRecentTaskItems.length > 0 && (
                        <div
                          id="task-recent-list"
                          className="taskRecent"
                          role="listbox"
                          aria-label="Recent tasks"
                        >
                          {filteredRecentTaskItems.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className="taskRecentItem"
                              data-state={
                                name === filteredRecentTaskItems[recentActiveIndex]
                                  ? 'active'
                                  : 'idle'
                              }
                              onMouseDown={(event) => {
                                event.preventDefault()
                                setTaskText(name)
                                setIsRecentOpen(false)
                              }}
                              role="option"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={taskHours}
                      onChange={(e) => setTaskHours(e.target.value)}
                      placeholder="Hours"
                      aria-label="Hours"
                    />
                    <input
                      type="number"
                      min="0"
                      value={taskMinutes}
                      onChange={(e) => setTaskMinutes(e.target.value)}
                      placeholder="Minutes"
                      aria-label="Minutes"
                    />
                    <button
                      onClick={addTaskEntry}
                      disabled={
                        !taskText.trim() || minutesFromTimeParts(taskHours, taskMinutes) === null
                      }
                      className="btn-primary"
                    >
                      Add task
                    </button>
                  </div>

                  {tasks.length > 0 && (
                    <div className="taskList">
                      {tasks.map((entry, index) => (
                        <div key={`${entry.text}-${index}`} className="taskRow">
                          <span>{entry.text}</span>
                          <span>{formatDuration(entry.minutes)}</span>
                          <button
                            onClick={() => removeTaskEntry(index)}
                            aria-label="Remove task"
                            className="btn-secondary"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="messagePreview" aria-label="Teams message preview">
                    {teamsMessage || 'Fill all fields to generate a Teams message preview.'}
                  </div>

                  <div className="messageActions">
                    <button
                      onClick={onCopyTeamsMessage}
                      disabled={!teamsMessage}
                      className="btn-primary"
                    >
                      Copy Teams message
                    </button>
                    {copyStatus === 'copied' && <span className="copyStatus">Copied.</span>}
                    {copyStatus === 'failed' && (
                      <span className="copyStatus">Copy failed. Please copy manually.</span>
                    )}
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
      </div>

      <div className="message" data-state={isStatusPanelOpen ? 'open' : 'closed'}>
          <button
            type="button"
            className="messageHeader"
            onClick={() => setIsStatusPanelOpen((prev) => !prev)}
            aria-expanded={isStatusPanelOpen}
            aria-controls="status-panel"
          >
            <span className="messageTitle">Next assignment message</span>
          </button>
          <div
            id="status-panel"
            className="messagePanel"
            data-state={isStatusPanelOpen ? 'open' : 'closed'}
            aria-hidden={!isStatusPanelOpen}
          >
            <div className="messagePanelInner">
              <fieldset disabled={!isStatusPanelOpen} className="messageFieldset">
                <div className="messageBody">
                  <div className="statusFields">
                    <input
                      type="text"
                      value={statusCompletedAssignment}
                      onChange={(e) => setStatusCompletedAssignment(e.target.value)}
                      placeholder="Completed assignment"
                      aria-label="Completed assignment"
                    />
                    <input
                      type="text"
                      value={statusNextAssignment}
                      onChange={(e) => setStatusNextAssignment(e.target.value)}
                      placeholder="Next assignment"
                      aria-label="Next assignment"
                    />
                    <input
                      type="text"
                      value={statusAssignee}
                      onChange={(e) => setStatusAssignee(e.target.value)}
                      placeholder="Confirm by"
                      aria-label="Status confirm by"
                      className="statusConfirmBy"
                    />
                    <input
                      type="datetime-local"
                      value={statusStartAt ? toDatetimeLocalValue(statusStartAt) : ''}
                      onChange={(e) => setStatusStartAt(parseDatetimeLocalValue(e.target.value))}
                      className="statusStartAt"
                      aria-label="Start time"
                    />
                  </div>

                  <div className="messagePreview" aria-label="Status message preview">
                    {statusMessage || 'Fill all fields to generate a status message.'}
                  </div>

                  <div className="messageActions">
                    <button
                      onClick={onCopyStatusMessage}
                      disabled={!statusMessage}
                      className="btn-primary"
                    >
                      Copy status message
                    </button>
                    {statusCopyStatus === 'copied' && <span className="copyStatus">Copied.</span>}
                    {statusCopyStatus === 'failed' && (
                      <span className="copyStatus">Copy failed. Please copy manually.</span>
                    )}
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
      </div>
    </div>
  )
}
