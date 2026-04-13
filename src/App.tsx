import { useEffect, useMemo, useRef, useState } from 'react'

import { formatDeadlineExtensionMessage, type TaskEntry } from './utils/deadlineHistory'
import { clearTextAfterDeadlineChange } from './utils/deadlineChange'
import { formatNextAssignmentMessage } from './utils/nextAssignmentMessage'
import { syncNextAssignmentMessageStartWithDeadline } from './utils/nextAssignmentMessageStart'
import {
  fmtDateTimeWithWeekday,
  fmtTime,
  msToParts,
  pad2,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from './utils/time'
import { updateRecentTaskNames } from './utils/taskHistory'
import {
  applyMinutesDeltaWithCarry,
  calculateTaskFinishTimes,
  formatTaskTimeWithDuration,
  minutesFromTimeParts,
  normalizeTaskTimeParts,
  pickTaskBatchBase,
  pickTaskFinishStart,
  stepHoursText,
} from './utils/taskTime'
import {
  atLocalTime,
  addWorkMinutes,
  isInWorkTime,
  nextWorkStart,
  shouldShowEarlyFinishReminder,
  shouldShowDeadlineExtensionReminder,
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
const LS_TASK_FINISH_BASE_KEY = 'aliveline:task-finish-base-iso'
const LS_DEADLINE_EXTENSION_ASSIGNMENT_KEY = 'aliveline:deadline-extension-assignment'
const LS_DEADLINE_EXTENSION_CONFIRMED_BY_KEY = 'aliveline:deadline-extension-confirmed-by'
const LS_NEXT_ASSIGNMENT_KEY = 'aliveline:next-assignment'
const LS_NEXT_ASSIGNMENT_CONFIRMED_BY_KEY = 'aliveline:next-assignment-confirmed-by'
const LS_NEXT_ASSIGNMENT_START_KEY = 'aliveline:next-assignment-start-iso'
const LS_PANEL_TASKS_OPEN_KEY = 'aliveline:panel-tasks-open'
const LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY = 'aliveline:panel-next-assignment-message-open'
const LS_SCHEDULE_VIEW_MODE_KEY = 'aliveline:schedule-view'
const LS_SCHEDULE_VIEW_ADJUSTED_KEY = 'aliveline:schedule-view-adjusted'
const LS_DAILY_CLEAR_KEY = 'aliveline:daily-clear'
const LS_REMINDER_NOTIFIED_KEY = 'aliveline:reminder-notified'
const LS_REMINDER_REQUESTED_KEY = 'aliveline:reminder-requested'
const LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY = 'aliveline:deadline-extension-reminder-notified'
const LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY = 'aliveline:deadline-extension-reminder-requested'
const REDUCTION_RATIO = 0.2
const ADJUSTED_SUFFIX = ' (-20%)'

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

type ScheduleViewMode = 'original' | 'adjusted'

function readStoredScheduleViewMode() {
  const savedMode = localStorage.getItem(LS_SCHEDULE_VIEW_MODE_KEY)
  if (savedMode === 'original' || savedMode === 'adjusted') {
    return savedMode
  }

  const savedAdjusted = localStorage.getItem(LS_SCHEDULE_VIEW_ADJUSTED_KEY)
  if (savedAdjusted === 'true') return 'adjusted'
  if (savedAdjusted === 'false') return 'original'
  return 'original'
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
  const [taskFinishBase, setTaskFinishBase] = useState<Date | null>(() =>
    readStoredDate(LS_TASK_FINISH_BASE_KEY)
  )
  const [taskName, setTaskName] = useState('')
  const [taskHours, setTaskHours] = useState('')
  const [taskMinutes, setTaskMinutes] = useState('')
  const [isRecentOpen, setIsRecentOpen] = useState(false)
  const [recentActiveIndex, setRecentActiveIndex] = useState<number>(-1)
  const [deadlineExtensionAssignment, setDeadlineExtensionAssignment] = useState(
    () => localStorage.getItem(LS_DEADLINE_EXTENSION_ASSIGNMENT_KEY) ?? ''
  )
  const [deadlineExtensionConfirmedBy, setDeadlineExtensionConfirmedBy] = useState(
    () => localStorage.getItem(LS_DEADLINE_EXTENSION_CONFIRMED_BY_KEY) ?? ''
  )
  const [nextAssignment, setNextAssignment] = useState(
    () => localStorage.getItem(LS_NEXT_ASSIGNMENT_KEY) ?? ''
  )
  const [nextAssignmentConfirmedBy, setNextAssignmentConfirmedBy] = useState(
    () => localStorage.getItem(LS_NEXT_ASSIGNMENT_CONFIRMED_BY_KEY) ?? ''
  )
  const [nextAssignmentStartAt, setNextAssignmentStartAt] = useState<Date | null>(
    () =>
      syncNextAssignmentMessageStartWithDeadline(
        readStoredDate(LS_NEXT_ASSIGNMENT_START_KEY),
        deadline
      )
  )
  const [deadlineExtensionCopyState, setDeadlineExtensionCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [nextAssignmentCopyState, setNextAssignmentCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_TASKS_OPEN_KEY, false)
  )
  const [isNextAssignmentPanelOpen, setIsNextAssignmentPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY, false)
  )
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>(() =>
    readStoredScheduleViewMode()
  )
  const isAdjustedView = scheduleViewMode === 'adjusted'

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
    } else {
      localStorage.removeItem(LS_PREV_CHANGED_KEY)
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
    if (taskFinishBase) {
      localStorage.setItem(LS_TASK_FINISH_BASE_KEY, taskFinishBase.toISOString())
    } else {
      localStorage.removeItem(LS_TASK_FINISH_BASE_KEY)
    }
  }, [taskFinishBase])

  useEffect(() => {
    localStorage.setItem(LS_DEADLINE_EXTENSION_ASSIGNMENT_KEY, deadlineExtensionAssignment)
  }, [deadlineExtensionAssignment])

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
    setPreviousDeadline(deadline)
    setPreviousChangedAt(now)
    setTasks([])
    setTaskName('')
    setTaskHours('')
    setTaskMinutes('')
    setChangeBaseDeadline(null)
    setTaskFinishBase(null)
    setPreviousTasks([])
  }, [now])

  const workMsLeft = useMemo(() => workMsBetween(now, deadline), [now, deadline])
  const adjustedWorkMsLeft = useMemo(
    () => Math.max(0, Math.round(workMsLeft * (1 - REDUCTION_RATIO))),
    [workMsLeft]
  )
  const displayWorkMsLeft = isAdjustedView ? adjustedWorkMsLeft : workMsLeft
  const parts = useMemo(() => msToParts(displayWorkMsLeft), [displayWorkMsLeft])
  const adjustedDeadline = useMemo(() => {
    const minutesLeft = Math.max(0, Math.round(adjustedWorkMsLeft / 60000))
    return addWorkMinutes(now, minutesLeft)
  }, [adjustedWorkMsLeft, now])
  const displayDeadline = isAdjustedView ? adjustedDeadline : deadline
  const workStartAt = useMemo(() => (isInWorkTime(now) ? now : nextWorkStart(now)), [now])
  const showEarlyFinishReminder = useMemo(
    () => shouldShowEarlyFinishReminder(now, deadline),
    [deadline, now]
  )
  const showDeadlineExtensionReminder = useMemo(
    () => shouldShowDeadlineExtensionReminder(now, deadline, tasks.length > 0),
    [deadline, now, tasks.length]
  )
  const taskFinishStart = useMemo(
    () => pickTaskFinishStart(now, taskFinishBase),
    [now, taskFinishBase]
  )
  const taskFinishTimes = useMemo(
    () => calculateTaskFinishTimes(taskFinishStart, tasks),
    [taskFinishStart, tasks]
  )
  const adjustedTasks = useMemo(
    () =>
      tasks.map((task) => ({
        ...task,
        minutes: Math.max(1, Math.round(task.minutes * (1 - REDUCTION_RATIO))),
      })),
    [tasks]
  )
  const adjustedTaskFinishTimes = useMemo(
    () => calculateTaskFinishTimes(taskFinishStart, adjustedTasks),
    [adjustedTasks, taskFinishStart]
  )

  const toggleAdjustedView = () => {
    setScheduleViewMode((prev) => (prev === 'original' ? 'adjusted' : 'original'))
  }

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
    if (!showDeadlineExtensionReminder) return
    if (typeof Notification === 'undefined') return

    const todayKey = dateKey(now)
    if (localStorage.getItem(LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY) === todayKey) {
      return
    }

    const sendNotification = () => {
      new Notification('Reminder', {
        body: 'Post the deadline extension message.',
      })
      localStorage.setItem(LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY, todayKey)
    }

    if (Notification.permission === 'granted') {
      sendNotification()
      return
    }

    if (Notification.permission === 'denied') return

    if (localStorage.getItem(LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY) === todayKey) {
      return
    }
    localStorage.setItem(LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY, todayKey)

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') sendNotification()
    })
  }, [deadline, now, showDeadlineExtensionReminder])

  useEffect(() => {
    localStorage.setItem(LS_DEADLINE_EXTENSION_CONFIRMED_BY_KEY, deadlineExtensionConfirmedBy)
  }, [deadlineExtensionConfirmedBy])

  useEffect(() => {
    localStorage.setItem(LS_NEXT_ASSIGNMENT_KEY, nextAssignment)
  }, [nextAssignment])

  useEffect(() => {
    localStorage.setItem(LS_NEXT_ASSIGNMENT_CONFIRMED_BY_KEY, nextAssignmentConfirmedBy)
  }, [nextAssignmentConfirmedBy])

  useEffect(() => {
    localStorage.setItem(LS_PANEL_TASKS_OPEN_KEY, String(isTasksPanelOpen))
  }, [isTasksPanelOpen])

  useEffect(() => {
    localStorage.setItem(
      LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY,
      String(isNextAssignmentPanelOpen)
    )
  }, [isNextAssignmentPanelOpen])

  useEffect(() => {
    localStorage.setItem(LS_SCHEDULE_VIEW_MODE_KEY, scheduleViewMode)
    localStorage.removeItem(LS_SCHEDULE_VIEW_ADJUSTED_KEY)
  }, [scheduleViewMode])

  useEffect(() => {
    if (nextAssignmentStartAt) {
      localStorage.setItem(LS_NEXT_ASSIGNMENT_START_KEY, nextAssignmentStartAt.toISOString())
    } else {
      localStorage.removeItem(LS_NEXT_ASSIGNMENT_START_KEY)
    }
  }, [nextAssignmentStartAt])

  useEffect(() => {
    setNextAssignmentStartAt((prev) =>
      syncNextAssignmentMessageStartWithDeadline(prev, deadline)
    )
  }, [deadline])

  const updateDeadline = (
    nextDeadline: Date,
    options?: { tasks?: TaskEntry[]; resetDrafts?: boolean }
  ) => {
    const shouldSyncPrevious = options?.resetDrafts
    const sameDeadline = nextDeadline.getTime() === deadline.getTime()
    if (sameDeadline && shouldSyncPrevious) {
      setPreviousDeadline(nextDeadline)
      setPreviousChangedAt(null)
      setPreviousTasks([])
      setTasks([])
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
      return
    }
    if (sameDeadline) return
    if (shouldSyncPrevious) {
      setPreviousDeadline(nextDeadline)
      setPreviousChangedAt(null)
      setPreviousTasks([])
    } else {
      setPreviousDeadline(deadline)
      setPreviousChangedAt(new Date())
      setPreviousTasks(options?.tasks ?? [])
    }
    setDeadlineExtensionAssignment(clearTextAfterDeadlineChange(deadlineExtensionAssignment))
    setNextAssignment(clearTextAfterDeadlineChange(nextAssignment))
    setDeadline(nextDeadline)
    if (options?.resetDrafts) {
      setTasks([])
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
    }
  }

  const onSetDeadline = (v: string) => {
    const d = parseDatetimeLocalValue(v)
    if (d) updateDeadline(d, { resetDrafts: true })
  }

  const reset = () => {
    updateDeadline(new Date(), { resetDrafts: true })
  }

  const deadlineExtensionMessage = useMemo(() => {
    if (!previousDeadline) return ''
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!deadlineExtensionConfirmedBy.trim()) return ''
    if (tasks.length === 0) return ''
    const messageTasks = isAdjustedView ? adjustedTasks : tasks
    const messageDeadline = isAdjustedView ? adjustedDeadline : deadline
    return formatDeadlineExtensionMessage({
      previous: previousDeadline,
      next: messageDeadline,
      tasks: messageTasks,
      assignment: deadlineExtensionAssignment,
      assignee: deadlineExtensionConfirmedBy,
    })
  }, [
    adjustedDeadline,
    adjustedTasks,
    deadline,
    deadlineExtensionConfirmedBy,
    deadlineExtensionAssignment,
    isAdjustedView,
    previousDeadline,
    tasks,
  ])

  const filteredRecentTaskItems = useMemo(() => {
    const needle = taskName.trim().toLowerCase()
    if (!needle) return recentTasks
    return recentTasks.filter((item) => item.toLowerCase().includes(needle))
  }, [recentTasks, taskName])

  useEffect(() => {
    setRecentActiveIndex(filteredRecentTaskItems.length > 0 ? 0 : -1)
  }, [filteredRecentTaskItems])

  useEffect(() => {
    setDeadlineExtensionCopyState('idle')
  }, [deadlineExtensionMessage])

  const nextAssignmentMessage = useMemo(() => {
    if (!nextAssignmentStartAt) return ''
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!nextAssignment.trim()) return ''
    if (!nextAssignmentConfirmedBy.trim()) return ''
    return formatNextAssignmentMessage({
      completedAssignment: deadlineExtensionAssignment,
      nextAssignment,
      assignee: nextAssignmentConfirmedBy,
      start: nextAssignmentStartAt,
      deadline,
    })
  }, [
    deadline,
    deadlineExtensionAssignment,
    nextAssignment,
    nextAssignmentConfirmedBy,
    nextAssignmentStartAt,
  ])

  useEffect(() => {
    setNextAssignmentCopyState('idle')
  }, [nextAssignmentMessage])

  const onCopyDeadlineExtensionMessage = async () => {
    if (!deadlineExtensionMessage) return
    try {
      await navigator.clipboard.writeText(deadlineExtensionMessage)
      setDeadlineExtensionCopyState('copied')
    } catch {
      setDeadlineExtensionCopyState('failed')
    }
  }

  const onCopyNextAssignmentMessage = async () => {
    if (!nextAssignmentMessage) return
    try {
      await navigator.clipboard.writeText(nextAssignmentMessage)
      setNextAssignmentCopyState('copied')
    } catch {
      setNextAssignmentCopyState('failed')
    }
  }

  const addTaskEntry = () => {
    const minutes = minutesFromTimeParts(taskHours, taskMinutes)
    if (!taskName.trim() || minutes === null) return
    const entry: TaskEntry = {
      text: taskName.trim(),
      minutes: Math.round(minutes),
    }
    setRecentTasks((prev) => updateRecentTaskNames(prev, entry.text))
    const nextTasks = [...tasks, entry]
    const baseDeadline = pickTaskBatchBase(deadline, changeBaseDeadline)
    const dueBase = pickTaskBatchBase(now, taskFinishBase)
    if (!changeBaseDeadline) {
      setChangeBaseDeadline(baseDeadline)
      setPreviousDeadline(baseDeadline)
      setPreviousChangedAt(new Date())
    }
    if (!taskFinishBase) {
      setTaskFinishBase(dueBase)
    }
    const totalMinutes = nextTasks.reduce((sum, task) => sum + task.minutes, 0)
    const nextDeadline = addWorkMinutes(baseDeadline, totalMinutes)
    setTasks(nextTasks)
    setPreviousTasks(nextTasks)
    setDeadline(nextDeadline)
    setTaskName('')
    setTaskHours('')
    setTaskMinutes('')
  }

  const removeTaskEntry = (index: number) => {
    const nextTasks = tasks.filter((_, i) => i !== index)
    setTasks(nextTasks)
    setPreviousTasks(nextTasks)
    if (nextTasks.length === 0) {
      if (changeBaseDeadline) {
        setDeadline(changeBaseDeadline)
      }
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
      return
    }

    if (changeBaseDeadline) {
      const totalMinutes = nextTasks.reduce((sum, task) => sum + task.minutes, 0)
      setDeadline(addWorkMinutes(changeBaseDeadline, totalMinutes))
    }
  }

  const onTaskMinutesChange = (value: string) => {
    const normalized = normalizeTaskTimeParts(taskHours, value)
    setTaskHours(normalized.hoursText)
    setTaskMinutes(normalized.minutesText)
  }

  const onStepTaskHours = (delta: number) => {
    setTaskHours((prev) => stepHoursText(prev, delta))
  }

  const onStepTaskMinutes = (delta: number) => {
    const normalized = applyMinutesDeltaWithCarry(taskHours, taskMinutes, delta)
    setTaskHours(normalized.hoursText)
    setTaskMinutes(normalized.minutesText)
  }

  return (
    <div className="app">
      <div className="deadlineSection">
        <div className="main">
          <div className="block">
            <div className="label">Previous deadline</div>
            <div className="previous">
              {previousDeadline ? fmtDateTimeWithWeekday(previousDeadline) : '—'}
            </div>
          </div>

          <div className="block">
            <div className="label">Deadline</div>
            <div className="deadline">
              <button
                type="button"
                className="valueToggle deadlineValue"
                aria-label="Toggle original and adjusted schedule"
                onClick={toggleAdjustedView}
              >
                <span aria-label="Current deadline display">
                  {fmtDateTimeWithWeekday(displayDeadline)}
                  {isAdjustedView ? ADJUSTED_SUFFIX : ''}
                </span>
              </button>
            </div>
          </div>

          <div className="block">
            <div className="label">Remaining (work time)</div>
            <div className="remaining">
              <button
                type="button"
                className="valueToggle remainingValue"
                aria-label="Toggle schedule display from remaining work time"
                onClick={toggleAdjustedView}
              >
                <span aria-label="Remaining work time display">
                  {parts.days > 0 && `${parts.days}d `}
                  {parts.hours}h {parts.minutes}m {parts.seconds}s
                  {isAdjustedView ? ADJUSTED_SUFFIX : ''}
                </span>
              </button>
            </div>
          </div>
          {showEarlyFinishReminder && (
            <div className="reminder">Reminder: ask for more work before 9:00 AM.</div>
          )}
          {showDeadlineExtensionReminder && <div className="reminder">Reminder: post the deadline extension message.</div>}
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
      </div>

      <div className="taskSection">
        <div className="taskSectionTitle">Tasks</div>
        <div className="taskFields">
            <div className="fieldGroup taskTextField">
              <label className="fieldLabel" htmlFor="task-name">
                Name
              </label>
              <div className="taskInputWrap">
                <input
                  id="task-name"
                  type="text"
                  value={taskName}
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setTaskName(nextValue)
                    if (nextValue.trim().length === 0) {
                      setIsRecentOpen(true)
                    }
                  }}
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
                      setTaskName(picked)
                      setIsRecentOpen(false)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      setIsRecentOpen(false)
                    }
                  }}
                placeholder="Name"
                aria-label="Name"
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
                          name === filteredRecentTaskItems[recentActiveIndex] ? 'active' : 'idle'
                        }
                        onMouseDown={(event) => {
                          event.preventDefault()
                          setTaskName(name)
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
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="task-hours">
                Hours
              </label>
              <div className="taskHoursInputWrap">
                <input
                  id="task-hours"
                  type="number"
                  min="0"
                  step="1"
                  value={taskHours}
                  onChange={(e) => setTaskHours(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      onStepTaskHours(1)
                      return
                    }

                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      onStepTaskHours(-1)
                    }
                  }}
                  placeholder="Hours"
                  aria-label="Hours"
                />
                <div className="taskHoursStepButtons">
                  <button
                    type="button"
                    className="taskStepButton"
                    data-dir="up"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onStepTaskHours(1)}
                    aria-label="Increase hours by 1"
                  />
                  <button
                    type="button"
                    className="taskStepButton"
                    data-dir="down"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onStepTaskHours(-1)}
                    aria-label="Decrease hours by 1"
                  />
                </div>
              </div>
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="task-minutes">
                Minutes
              </label>
              <div className="taskMinutesInputWrap">
                <input
                  id="task-minutes"
                  type="number"
                  min="-60"
                  step="1"
                  value={taskMinutes}
                  onChange={(e) => onTaskMinutesChange(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      onStepTaskMinutes(10)
                      return
                    }

                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      onStepTaskMinutes(-10)
                    }
                  }}
                  placeholder="Minutes"
                  aria-label="Minutes"
                />
                <div className="taskMinutesStepButtons">
                  <button
                    type="button"
                    className="taskStepButton"
                    data-dir="up"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onStepTaskMinutes(10)}
                    aria-label="Increase minutes by 10"
                  />
                  <button
                    type="button"
                    className="taskStepButton"
                    data-dir="down"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onStepTaskMinutes(-10)}
                    aria-label="Decrease minutes by 10"
                  />
                </div>
              </div>
            </div>
            <div className="fieldGroup">
              <span className="fieldLabel fieldLabelSpacer" aria-hidden="true">
                Action
              </span>
              <button
                onClick={addTaskEntry}
                disabled={!taskName.trim() || minutesFromTimeParts(taskHours, taskMinutes) === null}
                className="btn-primary"
              >
                <i className="las la-plus" aria-hidden="true"></i> Add task
              </button>
            </div>
          </div>

        {tasks.length > 0 && (
          <div className="taskList">
            {tasks.map((entry, index) => (
              <div key={`${entry.text}-${index}`} className="taskRow">
                <div className="taskInfo">
                  <span className="taskName">{entry.text}</span>
                </div>
                <button
                  type="button"
                  className="valueToggle taskDueValue"
                  aria-label="Toggle schedule display from task due time"
                  onClick={toggleAdjustedView}
                >
                  <span aria-label="Task due time display">
                    {isAdjustedView
                      ? `${formatTaskTimeWithDuration(adjustedTaskFinishTimes[index], adjustedTasks[index].minutes)}${ADJUSTED_SUFFIX}`
                      : formatTaskTimeWithDuration(taskFinishTimes[index], entry.minutes)}
                  </span>
                </button>
                <button
                  onClick={() => removeTaskEntry(index)}
                  aria-label="Remove task"
                  className="btn-secondary taskRemoveButton"
                >
                  <i className="las la-trash" aria-hidden="true"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="messagesSection">
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
                    <div className="fieldGroup">
                      <label className="fieldLabel" htmlFor="deadline-extension-assignment">
                        Assignment
                      </label>
                      <input
                        id="deadline-extension-assignment"
                        type="text"
                        value={deadlineExtensionAssignment}
                        onChange={(e) => setDeadlineExtensionAssignment(e.target.value)}
                        placeholder="Assignment"
                        aria-label="Assignment name"
                      />
                    </div>
                    <div className="fieldGroup">
                      <label className="fieldLabel" htmlFor="deadline-extension-confirmed-by">
                        Confirmed by
                      </label>
                      <input
                        id="deadline-extension-confirmed-by"
                        type="text"
                        value={deadlineExtensionConfirmedBy}
                        onChange={(e) => setDeadlineExtensionConfirmedBy(e.target.value)}
                        placeholder="Confirmed by"
                        aria-label="Confirmed by"
                      />
                    </div>
                  </div>

                  <div className="messagePreview" aria-label="Deadline extension message preview">
                    {deadlineExtensionMessage || 'Fill all fields to generate a deadline extension message preview.'}
                  </div>

                  <div className="messageActions">
                    <button
                      onClick={onCopyDeadlineExtensionMessage}
                      disabled={!deadlineExtensionMessage}
                      className="btn-primary"
                    >
                      <i className="las la-copy" aria-hidden="true"></i> Copy
                    </button>
                    {deadlineExtensionCopyState === 'copied' && (
                      <span className="copyStatus">Copied.</span>
                    )}
                    {deadlineExtensionCopyState === 'failed' && (
                      <span className="copyStatus">Copy failed. Please copy manually.</span>
                    )}
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
      </div>

      <div className="message" data-state={isNextAssignmentPanelOpen ? 'open' : 'closed'}>
          <button
            type="button"
            className="messageHeader"
            onClick={() => setIsNextAssignmentPanelOpen((prev) => !prev)}
            aria-expanded={isNextAssignmentPanelOpen}
            aria-controls="next-assignment-message-panel"
          >
            <span className="messageTitle">Next assignment message</span>
          </button>
          <div
            id="next-assignment-message-panel"
            className="messagePanel"
            data-state={isNextAssignmentPanelOpen ? 'open' : 'closed'}
            aria-hidden={!isNextAssignmentPanelOpen}
          >
            <div className="messagePanelInner">
              <fieldset
                disabled={!isNextAssignmentPanelOpen}
                className="messageFieldset"
              >
                <div className="messageBody">
                  <div className="nextAssignmentMessageFields">
                    <div className="fieldGroup">
                      <label
                        className="fieldLabel"
                        htmlFor="next-assignment-message-completed-assignment"
                      >
                        Completed assignment
                      </label>
                      <input
                        id="next-assignment-message-completed-assignment"
                        type="text"
                        value={deadlineExtensionAssignment}
                        onChange={(e) => setDeadlineExtensionAssignment(e.target.value)}
                        placeholder="Completed assignment"
                        aria-label="Completed assignment"
                      />
                    </div>
                    <div className="fieldGroup">
                      <label
                        className="fieldLabel"
                        htmlFor="next-assignment-message-next-assignment"
                      >
                        Next assignment
                      </label>
                      <input
                        id="next-assignment-message-next-assignment"
                        type="text"
                        value={nextAssignment}
                        onChange={(e) => setNextAssignment(e.target.value)}
                        placeholder="Next assignment"
                        aria-label="Next assignment"
                      />
                    </div>
                    <div className="fieldGroup nextAssignmentMessageConfirmedBy">
                      <label
                        className="fieldLabel"
                        htmlFor="next-assignment-message-confirmed-by"
                      >
                        Confirmed by
                      </label>
                      <input
                        id="next-assignment-message-confirmed-by"
                        type="text"
                        value={nextAssignmentConfirmedBy}
                        onChange={(e) => setNextAssignmentConfirmedBy(e.target.value)}
                        placeholder="Confirmed by"
                        aria-label="Next assignment message confirmed by"
                      />
                    </div>
                    <div className="fieldGroup nextAssignmentStartAt">
                      <label
                        className="fieldLabel"
                        htmlFor="next-assignment-message-start-at"
                      >
                        Start time
                      </label>
                      <input
                        id="next-assignment-message-start-at"
                        type="datetime-local"
                        value={
                          nextAssignmentStartAt
                            ? toDatetimeLocalValue(nextAssignmentStartAt)
                            : ''
                        }
                        disabled
                        readOnly
                        aria-label="Start time"
                      />
                    </div>
                  </div>

                  <div className="messagePreview" aria-label="Next assignment message preview">
                    {nextAssignmentMessage ||
                      'Fill all fields to generate a next assignment message.'}
                  </div>

                  <div className="messageActions">
                    <button
                      onClick={onCopyNextAssignmentMessage}
                      disabled={!nextAssignmentMessage}
                      className="btn-primary"
                    >
                      <i className="las la-copy" aria-hidden="true"></i> Copy
                    </button>
                    {nextAssignmentCopyState === 'copied' && (
                      <span className="copyStatus">Copied.</span>
                    )}
                    {nextAssignmentCopyState === 'failed' && (
                      <span className="copyStatus">Copy failed. Please copy manually.</span>
                    )}
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
      </div>
      </div>
    </div>
  )
}
